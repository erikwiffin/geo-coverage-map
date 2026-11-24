"""Geosetta API client (https://geosetta.org/api_docs/): auth, disk cache and rate limits.

Every response is cached under data/raw/geosetta/ keyed by a hash of the request, so a re-run
makes no calls unless --refresh is given, and `build` can run cache-only (offline=True).

Limits (api_docs, read 2026-11-24): the data API (POST /web_map/api_key/) allows 100 requests per
hour, vector tiles 500 per hour per key, plus a per-key daily quota (value not published) that
answers HTTP 429 until 00:00 UTC. We stay under the hourly limits with a sliding window whose
timestamps persist in usage.json (so back-to-back runs share one budget), space all calls at
least `min_interval_s` apart, and stop with QuotaExceeded on a 429 instead of retrying.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path

import requests

log = logging.getLogger(__name__)

BASE = "https://geosetta.org"
# bucket -> (max requests, window seconds). Kept ~10% under the documented limits.
LIMITS = {"data_api": (90, 3600), "tiles": (450, 3600), "other": (600, 3600),
          # undocumented: the 31st site report within ~13 minutes got a bare HTTP 403
          # (2026-11-24); other endpoints kept answering. Treated as ~30 per hour.
          "site_report": (28, 3600)}


class QuotaExceeded(Exception):
    """HTTP 429: the per-key daily quota or a burst limit is used up. Resume later from cache."""


class NotCached(Exception):
    """Offline mode and the response isn't in the cache."""


class GeosettaClient:
    def __init__(self, cache_dir: Path, key: str | None = None, refresh: bool = False,
                 offline: bool = False, min_interval_s: float = 1.0, max_wait_s: float = 900,
                 user_agent: str = "geotech-coverage/0.1"):
        self.key = key if key is not None else os.environ.get("GEOSETTA_API_KEY")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.refresh, self.offline = refresh, offline
        self.min_interval_s, self.max_wait_s = min_interval_s, max_wait_s
        self.session = requests.Session()
        self.session.headers["User-Agent"] = user_agent
        if self.key:  # web_map endpoints read Bearer; site_class and diggs.* read X-API-Key
            self.session.headers["Authorization"] = f"Bearer {self.key}"
            self.session.headers["X-API-Key"] = self.key
        self._usage_path = self.cache_dir / "usage.json"
        self._last = 0.0
        self.calls = 0       # network calls made by this client
        self.cache_hits = 0

    # ------------------------------------------------------------------ rate limiting
    def _usage(self) -> dict[str, list[float]]:
        try:
            return json.loads(self._usage_path.read_text())
        except (OSError, ValueError):
            return {}

    def _reserve(self, bucket: str) -> None:
        cap, window = LIMITS[bucket]
        while True:
            now = time.time()
            usage = self._usage()
            ts = [t for t in usage.get(bucket, []) if now - t < window]
            if len(ts) < cap:
                break
            wait = ts[0] + window - now + 1
            if wait > self.max_wait_s:
                raise QuotaExceeded(f"{bucket}: {cap} requests in the last hour; "
                                    f"next slot in {wait / 60:.0f} min. Re-run later (cached).")
            log.info("geosetta %s: hourly budget used, waiting %.0f s", bucket, wait)
            time.sleep(wait)
        gap = self.min_interval_s - (now - self._last)
        if gap > 0:
            time.sleep(gap)
        self._last = time.time()
        ts.append(self._last)
        usage[bucket] = ts
        self._usage_path.write_text(json.dumps(usage))

    # ------------------------------------------------------------------ requests
    def _cache_path(self, kind: str, method: str, url: str, body) -> Path:
        h = hashlib.sha1(json.dumps([method, url, body], sort_keys=True).encode()).hexdigest()
        return self.cache_dir / kind / h[:2] / f"{h}.json"

    def request(self, method: str, path: str, *, kind: str, bucket: str = "other",
                json_body=None, ok_status=(200,), binary: bool = False):
        """Return {"status": int, "body": parsed JSON | text | hex bytes}. Cached by request."""
        url = path if path.startswith("http") else BASE + path
        cp = self._cache_path(kind, method, url, json_body)
        if cp.exists() and not self.refresh:
            self.cache_hits += 1
            return json.loads(cp.read_text())
        if self.offline:
            raise NotCached(url)
        if not self.key:
            raise QuotaExceeded("GEOSETTA_API_KEY not set")
        for attempt in range(4):
            self._reserve(bucket)
            self.calls += 1
            try:
                r = self.session.request(method, url, json=json_body, timeout=180)
            except (requests.ConnectionError, requests.Timeout) as e:
                if attempt == 3:
                    raise
                log.warning("geosetta %s: %s; retrying", url, e.__class__.__name__)
                time.sleep(5 * 2 ** attempt)
                continue
            if r.status_code == 429:
                raise QuotaExceeded(f"HTTP 429 from {path}: {r.text[:200]}")
            if r.status_code == 403 and "<html" in r.text[:200].lower():
                # a bare HTML 403 (not a JSON auth error) is the server's throttle
                raise QuotaExceeded(f"HTTP 403 (throttled) from {path}")
            if r.status_code >= 500 and attempt < 3:
                log.warning("geosetta %s: HTTP %s; retrying", url, r.status_code)
                time.sleep(5 * 2 ** attempt)
                continue
            break
        if binary:
            body = r.content.hex()
        else:
            try:
                body = r.json()
            except ValueError:
                body = r.text
        out = {"status": r.status_code, "body": body}
        if r.status_code in ok_status or r.status_code in (400, 404):
            # 400/404 are stable answers (no parsed data / not found): cache them too
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps(out))
        if r.status_code not in ok_status and r.status_code not in (400, 404):
            raise requests.HTTPError(f"HTTP {r.status_code} from {url}: {str(body)[:200]}")
        return out

    def deliverable(self, deliverable_type: str, data: dict, kind: str):
        """POST /web_map/api_key/ (the rate-limited data API)."""
        return self.request("POST", "/web_map/api_key/", kind=kind, bucket="data_api",
                            json_body={"deliverableType": deliverable_type, "data": data})


def client_for(ctx, offline: bool = False) -> GeosettaClient:
    http = ctx.area.get("http", {})
    return GeosettaClient(ctx.raw_dir / "geosetta", refresh=getattr(ctx, "refresh", False),
                          offline=offline,
                          user_agent=http.get("user_agent", "geotech-coverage/0.1"))
