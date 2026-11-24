"""Geosetta API adapter: every Geosetta borehole and report location in the envelope.

Needs GEOSETTA_API_KEY (skipped cleanly without it). API docs: https://geosetta.org/api_docs/

1. Return_Historic_Data_In_Radius over a grid of overlapping 5 km circles covering the bbox
   (radius capped at 5 km, max 500 boreholes per call: a full circle is split into 4 smaller).
2. Vector tiles (layer "boreholes") give each key's location precision (`loc: site_level`) and
   report group (`grp`), which the radius query doesn't return.
3. DIGGS XML (one request per key) for boreholes with parsed data (depth, SPT N, lithology,
   lab), parsed with the same code as the browser exports (`diggs.parse_diggs`).
4. do_files_json for non-DOT locations: the source document (usually a PDF report). The files
   need a key to download, so the map links to the point on Geosetta's own map instead.

Documents are described in config/documents.yaml (title, author, kind, reuse rights), keyed by
Geosetta's file path. All requests go through GeosettaClient: cached, rate limited.
"""
from __future__ import annotations

import logging
import math
import os
from pathlib import Path
from urllib.parse import quote

import mapbox_vector_tile
import yaml

from ..config import ROOT
from ..geosetta_api import GeosettaClient, NotCached, QuotaExceeded, client_for
from .diggs import parse_diggs

log = logging.getLogger(__name__)
MAX_PER_CALL = 500


class SourceSkipped(Exception):
    pass


def documents_catalog(src: dict) -> dict:
    p = ROOT / src.get("documents", "config/documents.yaml")
    return (yaml.safe_load(p.read_text()) or {}) if p.exists() else {}


def circle_grid(bbox, radius_m: float):
    """Centres of circles of radius_m whose inscribed squares tile bbox (full coverage)."""
    w, s, e, n = bbox
    step = radius_m * math.sqrt(2) * 0.96  # square inscribed in the circle, with 4% overlap
    lat0 = (s + n) / 2
    dlat, dlon = step / 111_320, step / (111_320 * math.cos(math.radians(lat0)))
    nx, ny = max(1, math.ceil((e - w) / dlon)), max(1, math.ceil((n - s) / dlat))
    return [(s + (i + .5) * (n - s) / ny, w + (j + .5) * (e - w) / nx)
            for i in range(ny) for j in range(nx)]


def radius_query(c: GeosettaClient, bbox, radius_m: float = 5000) -> dict[str, dict]:
    out: dict[str, dict] = {}
    todo = [(lat, lon, radius_m) for lat, lon in circle_grid(bbox, radius_m)]
    while todo:
        lat, lon, r = todo.pop(0)
        res = c.deliverable("Return_Historic_Data_In_Radius", {"points": [
            {"latitude": round(lat, 6), "longitude": round(lon, 6), "radius_m": r}]},
            kind="radius")["body"]
        feats = res["results"]["points_in_radius"]["features"]
        if len(feats) >= MAX_PER_CALL and r > 500:  # truncated: split into 4 smaller circles
            d = r / 2 / 111_320
            dl = d / math.cos(math.radians(lat))
            todo += [(lat + a * d, lon + b * dl, r / 2 * 1.05) for a in (-1, 1) for b in (-1, 1)]
            log.info("  radius %.0f m at %.4f,%.4f hit %d: splitting", r, lat, lon, len(feats))
            continue
        for f in feats:
            out[f["properties"]["functionalkey"]] = f["properties"]
    return out


def _tile_xy(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def tile_index(c: GeosettaClient, bbox, z: int = 13) -> dict[str, dict]:
    """fk -> {loc, kind, grp} from the borehole vector tiles over bbox (unclustered at z>=9)."""
    w, s, e, n = bbox
    x0, y0 = _tile_xy(n, w, z)
    x1, y1 = _tile_xy(s, e, z)
    out = {}
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            r = c.request("GET", f"/web_map/tiles/{z}/{x}/{y}.pbf", kind="tiles",
                          bucket="tiles", binary=True)
            if r["status"] != 200 or not r["body"]:
                continue
            layer = mapbox_vector_tile.decode(bytes.fromhex(r["body"])).get("boreholes")
            for f in (layer or {}).get("features", []):
                p = f["properties"]
                if p.get("fk"):
                    out[p["fk"]] = {k: p.get(k) for k in ("loc", "kind", "grp", "t", "src")}
    return out


def _enc(fk: str) -> str:
    return quote(fk, safe="")


def diggs_logs(c: GeosettaClient, keys: list[str]) -> dict[str, dict]:
    """fk -> parsed DIGGS record, one request per key. (The docs say keys can be comma-joined,
    but a joined request returned an empty document on 2026-11-24.)"""
    out: dict[str, dict] = {}
    for k in keys:
        r = c.request("GET", "/web_map/diggs_xml/" + _enc(k), kind="diggs")
        recs = parse_diggs(_xml(r["body"])) if r["status"] == 200 else []
        if recs:  # several boreholes can share one coordinate: keep the richest
            out[k] = max(recs, key=lambda r: (len(r["n_values"]) + len(r["lithology"]),
                                              r["depth_ft"] or 0))
    return out


def _xml(body) -> str:
    t = body if isinstance(body, str) else ""
    i, j = t.find("<Diggs"), t.rfind("</Diggs>")
    return t[i:j + len("</Diggs>")] if i >= 0 and j > i else "<Diggs xmlns='http://diggsml.org/schemas/3'/>"


def files_for(c: GeosettaClient, fk: str) -> list[dict]:
    r = c.request("GET", f"/web_map/do_files_json/{_enc(fk)}/", kind="files")
    return (r["body"] or {}).get("files", []) if r["status"] == 200 and isinstance(
        r["body"], dict) else []


def collect(c: GeosettaClient, bbox, catalog: dict, tile_zoom: int = 13) -> tuple[list, dict]:
    pts = radius_query(c, bbox)
    log.info("  geosetta: %d boreholes/locations from radius queries", len(pts))
    tiles = tile_index(c, bbox, tile_zoom)
    logs = diggs_logs(c, [k for k, p in pts.items() if p.get("total_depth_ft") is not None])
    log.info("  geosetta: %d parsed logs", len(logs))
    files: dict[str, list] = {}
    for fk, p in pts.items():  # documents for non-DOT locations (DOT logs come via FDOT itself)
        if p.get("source") == "FDOT":
            continue
        grp = fk.split(":")[0] if ":" in fk else None
        key = grp or fk
        if key not in files:
            files[key] = files_for(c, fk)
    recs, extra = [], {"n_radius": len(pts), "n_tiles_keys": len(tiles), "n_logs": len(logs),
                       "documents": {}}
    for fk, p in pts.items():
        lat, lon = p.get("latitude"), p.get("longitude")
        if lat is None or lon is None:
            continue
        t = tiles.get(fk, {})
        lg = logs.get(fk)
        grp = fk.split(":")[0] if ":" in fk else t.get("grp")
        fl = files.get(grp or fk) or files.get(fk) or []
        doc = fl[0] if fl else None
        cat = catalog.get(doc["path"]) if doc else None
        precision = t.get("loc") or ("site_level" if ":" in fk else None)
        name = (lg or {}).get("name") or (fk.split(":", 1)[1] if ":" in fk else None)
        test_type = (lg or {}).get("test_type") or ("Document" if doc else None)
        flags = ["approx_location"] if precision == "site_level" else []
        if cat and cat.get("site_specific") is False:
            flags.append("not_site_data")
        log_d = None
        if lg:
            log_d = dict(lg["log"], via="Geosetta API (DIGGS)")
        a = {
            "uid": fk, "name": name, "provider": p.get("source"),
            "project": (lg or {}).get("project") or (cat or {}).get("title"),
            "test_type": test_type,
            "depth_ft": (lg or {}).get("depth_ft") or p.get("total_depth_ft"),
            "elev_ft": p.get("elevation_ft") if p.get("elevation_ft") is not None
            else (lg or {}).get("elev_ft"),
            "groundwater_depth_ft": (lg or {}).get("groundwater_depth_ft"),
            "log": log_d,
            "location_precision": precision,
            "report_group": grp,
            "doc_path": doc["path"] if doc else None,
            "n_files": len(fl),
            "geosetta_url": f"https://geosetta.org/web_map/map/#18/{lat:.6f}/{lon:.6f}",
            "flags": flags,
        }
        if cat:
            a.update({"doc_title": cat.get("title"), "doc_author": cat.get("author"),
                      "doc_kind": cat.get("kind"), "rights": cat.get("rights"),
                      "rights_detail": cat.get("rights_detail")})
            extra["documents"][doc["path"]] = cat.get("title")
        elif doc:
            extra["documents"][doc["path"]] = "(not in config/documents.yaml)"
        recs.append({"attrs": a, "lon": lon, "lat": lat})
    extra["calls"], extra["cache_hits"] = c.calls, c.cache_hits
    return recs, extra


def fetch(src: dict, ctx, bbox) -> list[dict]:
    if not os.environ.get("GEOSETTA_API_KEY") and not _have_cache(ctx):
        raise SourceSkipped("GEOSETTA_API_KEY not set")
    c = client_for(ctx, offline=not os.environ.get("GEOSETTA_API_KEY"))
    try:
        recs, extra = collect(c, bbox, documents_catalog(src), src.get("tile_zoom", 13))
    except (QuotaExceeded, NotCached) as e:
        raise SourceSkipped(f"Geosetta API: {e}") from e
    fetch.last_extra = extra  # read by the CLI for the profile
    log.info("  geosetta: %d records (%d API calls, %d cached)", len(recs), c.calls, c.cache_hits)
    return [r for r in recs if not bbox or (bbox[0] <= r["lon"] <= bbox[2]
                                            and bbox[1] <= r["lat"] <= bbox[3])]


def _have_cache(ctx) -> bool:
    return (Path(ctx.raw_dir) / "geosetta" / "radius").exists()
