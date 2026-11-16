"""Paged ArcGIS REST client with polite rate limiting, retries and an on-disk cache."""
from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

log = logging.getLogger(__name__)

RETRY_STATUS = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    pass


class RemoteBlocked(FetchError):
    """The remote host (not our sandbox) refused the request, e.g. a WAF block page."""


class SandboxBlocked(FetchError):
    """The sandbox egress proxy refused the host (x-deny-reason: host_not_allowed)."""


def classify_response(resp: requests.Response) -> str:
    """Return 'ok', 'sandbox_blocked', 'remote_blocked' or 'error'."""
    if resp.headers.get("x-deny-reason") == "host_not_allowed":
        return "sandbox_blocked"
    ctype = resp.headers.get("content-type", "")
    body = resp.text[:2000] if resp.content else ""
    if resp.status_code == 403 or ("text/html" in ctype and "WAF" in body):
        return "remote_blocked"
    if resp.status_code >= 400:
        return "error"
    return "ok"


class Client:
    def __init__(self, cache_dir: Path, user_agent: str, max_rps: float = 2.0,
                 refresh: bool = False, session: requests.Session | None = None,
                 timeout: float = 60, max_retries: int = 5):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = user_agent
        self.min_interval = 1.0 / max_rps
        self.refresh = refresh
        self.timeout = timeout
        self.max_retries = max_retries
        self._last: dict[str, float] = {}
        self.requests_made = 0

    # -- low level -------------------------------------------------------
    def _cache_path(self, url: str, params: dict) -> Path:
        key = json.dumps([url, sorted(params.items())], default=str)
        return self.cache_dir / (hashlib.sha256(key.encode()).hexdigest()[:24] + ".json")

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        wait = self._last.get(host, 0) + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last[host] = time.monotonic()

    def request(self, url: str, params: dict, method: str = "GET", text: bool = False):
        """JSON (default) or raw text (`text=True`, e.g. USGS RDB), cached on disk."""
        path = self._cache_path(url, params)
        if text:
            path = path.with_suffix(".txt")
        if path.exists() and not self.refresh:
            return path.read_text() if text else json.loads(path.read_text())
        delay = 1.0
        for attempt in range(self.max_retries + 1):
            self._throttle(url)
            try:
                self.requests_made += 1
                if method == "POST":
                    resp = self.session.post(url, data=params, timeout=self.timeout)
                else:
                    resp = self.session.get(url, params=params, timeout=self.timeout)
            except (requests.Timeout, requests.ConnectionError) as e:
                if attempt == self.max_retries:
                    raise FetchError(f"{url}: {e}") from e
                log.warning("network error (%s), retrying in %.0fs", e, delay)
                time.sleep(delay)
                delay *= 2
                continue
            if resp.status_code in RETRY_STATUS and attempt < self.max_retries:
                log.warning("HTTP %s from %s, retrying in %.0fs", resp.status_code, url, delay)
                time.sleep(delay)
                delay *= 2
                continue
            kind = classify_response(resp)
            if kind == "sandbox_blocked":
                raise SandboxBlocked(f"{urlparse(url).netloc} is not on the sandbox allowlist")
            if kind == "remote_blocked":
                raise RemoteBlocked(
                    f"{urlparse(url).netloc} refused the request (HTTP {resp.status_code}; "
                    "looks like the host's own firewall/WAF, not the sandbox)")
            if kind == "error":
                raise FetchError(f"HTTP {resp.status_code} from {url}: {resp.text[:300]}")
            if text:
                path.write_text(resp.text)
                return resp.text
            data = resp.json()
            if isinstance(data, dict) and "error" in data:
                raise FetchError(f"ArcGIS error from {url}: {data['error']}")
            path.write_text(json.dumps(data))
            return data
        raise FetchError(f"gave up on {url}")

    # -- ArcGIS helpers --------------------------------------------------
    def layer_info(self, layer_url: str) -> dict:
        return self.request(layer_url, {"f": "json"})

    def query_ids(self, layer_url: str, where: str = "1=1",
                  bbox: tuple[float, float, float, float] | None = None) -> list[int]:
        params = {"f": "json", "where": where, "returnIdsOnly": "true"}
        params.update(_envelope_params(bbox))
        data = self.request(layer_url + "/query", params)
        return sorted(data.get("objectIds") or [])

    def query_features(self, layer_url: str, where: str = "1=1",
                       bbox: tuple[float, float, float, float] | None = None,
                       batch: int = 500, out_fields: str = "*",
                       return_geometry: bool = True, extra: dict | None = None) -> list[dict]:
        """Fetch features via returnIdsOnly + POST batches of <= `batch` object IDs."""
        ids = self.query_ids(layer_url, where, bbox)
        feats: list[dict] = []
        for i in range(0, len(ids), batch):
            chunk = ids[i:i + batch]
            params = {
                "f": "json",
                "objectIds": ",".join(map(str, chunk)),
                "outFields": out_fields,
                "returnGeometry": str(return_geometry).lower(),
                "outSR": "4326",
                **(extra or {}),
            }
            data = self.request(layer_url + "/query", params, method="POST")
            feats.extend(data.get("features", []))
            log.info("  %s: %d/%d features", urlparse(layer_url).netloc, len(feats), len(ids))
        return feats


def _envelope_params(bbox):
    if not bbox:
        return {}
    xmin, ymin, xmax, ymax = bbox
    return {
        "geometry": json.dumps({"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax,
                                "spatialReference": {"wkid": 4326}}),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
    }


def make_client(ctx) -> Client:
    http = ctx.area.get("http", {})
    ua = http.get("user_agent", "geotech-coverage/0.1")
    if http.get("contact_email"):
        ua += f"; contact: {http['contact_email']}"
    return Client(ctx.raw_dir, ua, http.get("max_rps_per_host", 2), refresh=ctx.refresh)
