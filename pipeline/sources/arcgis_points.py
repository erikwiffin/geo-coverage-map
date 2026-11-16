"""Generic ArcGIS point-layer adapter (FDOT soil borings, FGS wells, ...).

If the source config has `import_dir` and that folder holds saved query responses
(`*.json` files from `<layer>/query?...&outSR=4326&f=json` or `f=geojson`), those are used instead
of the network. This is for hosts that block scripted clients but work in a browser
(gis.fdot.gov). `layer.json` in the same folder, if present, is the saved `?f=pjson` metadata.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from ..arcgis import make_client
from ..config import ROOT

log = logging.getLogger(__name__)


def imported_files(src: dict) -> list[Path]:
    d = src.get("import_dir")
    if not d:
        return []
    d = Path(d) if Path(d).is_absolute() else ROOT / d
    return sorted(p for p in d.glob("*.json") if p.name != "layer.json") if d.exists() else []


def layer_metadata(src: dict) -> dict | None:
    d = src.get("import_dir")
    if not d:
        return None
    p = (Path(d) if Path(d).is_absolute() else ROOT / d) / "layer.json"
    return json.loads(p.read_text()) if p.exists() else None


def _records_from_response(data: dict) -> list[dict]:
    if "error" in data:
        raise ValueError(f"saved response is an ArcGIS error: {data['error']}")
    sr = (data.get("spatialReference") or {}).get("wkid")
    if sr not in (None, 4326, 4269):
        raise ValueError(f"saved response is in wkid {sr}; re-download with outSR=4326")
    out = []
    for f in data.get("features", []):
        if "attributes" in f:  # Esri JSON
            g = f.get("geometry") or {}
            out.append({"attrs": f["attributes"], "lon": g.get("x"), "lat": g.get("y")})
        else:  # GeoJSON
            c = (f.get("geometry") or {}).get("coordinates") or [None, None]
            out.append({"attrs": f.get("properties") or {}, "lon": c[0], "lat": c[1]})
    return out


def from_files(src: dict, files: list[Path], bbox) -> list[dict]:
    oid = src.get("field_map", {}).get("native_id", "OBJECTID")
    seen, out = set(), []
    for p in files:
        data = json.loads(p.read_text())
        if data.get("exceededTransferLimit") or (data.get("properties") or {}).get(
                "exceededTransferLimit"):
            log.warning("%s says exceededTransferLimit: download the next page too", p.name)
        for r in _records_from_response(data):
            k = r["attrs"].get(oid)
            if k in seen:
                continue
            seen.add(k)
            if bbox and r["lon"] is not None and r["lat"] is not None and not (
                    bbox[0] <= r["lon"] <= bbox[2] and bbox[1] <= r["lat"] <= bbox[3]):
                continue
            out.append(r)
    log.info("  %s: %d records imported from %d saved file(s)", src["id"], len(out), len(files))
    return out


def fetch(src: dict, ctx, bbox) -> list[dict]:
    files = imported_files(src)
    if files:
        return from_files(src, files, bbox)
    client = make_client(ctx)
    feats = client.query_features(src["url"], src.get("where", "1=1"), bbox)
    out = []
    for f in feats:
        g = f.get("geometry") or {}
        out.append({"attrs": f.get("attributes", {}), "lon": g.get("x"), "lat": g.get("y")})
    return out
