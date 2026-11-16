"""Generic ArcGIS point-layer adapter (FDOT soil borings, FGS wells, ...).

If the source config has `import_dir` and that folder holds saved query responses
(`*.json` files from `<layer>/query?...&outSR=4326&f=json` or `f=geojson`), those are used instead
of the network. This is for hosts that block scripted clients but work in a browser
(gis.fdot.gov). `layer.json` in the same folder, if present, is the saved `?f=pjson` metadata.
`attachments.json`, if present, is a saved `<layer>/queryAttachments?...&f=json` response; each
record then gets direct links to its attachment files.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from shapely.geometry import MultiPolygon, mapping, shape

from ..arcgis import make_client
from ..config import ROOT

log = logging.getLogger(__name__)


SPECIAL = {"layer.json", "attachments.json"}


def _dir(src: dict) -> Path | None:
    d = src.get("import_dir")
    if not d:
        return None
    return Path(d) if Path(d).is_absolute() else ROOT / d


def imported_files(src: dict) -> list[Path]:
    d = _dir(src)
    if not d or not d.exists():
        return []
    return sorted(p for p in d.glob("*.json")
                  if p.name not in SPECIAL and not p.name.startswith("attachments"))


def attachments_files(src: dict) -> list[Path]:
    d = _dir(src)
    return sorted(d.glob("attachments*.json")) if d and d.exists() else []


def attachments_file(src: dict) -> Path | None:  # kept for callers that only need a yes/no
    files = attachments_files(src)
    return files[0] if files else None


def load_attachments(src: dict) -> dict[int, list[dict]]:
    """parentObjectId -> [{id, name, contentType, size, url}] from a saved queryAttachments page."""
    out: dict[int, list[dict]] = {}
    groups = [g for p in attachments_files(src)
              for g in json.loads(p.read_text()).get("attachmentGroups", [])]
    for g in groups:
        oid = g.get("parentObjectId")
        out[oid] = [{"id": a["id"], "name": a.get("name"), "contentType": a.get("contentType"),
                     "size": a.get("size"),
                     "url": f"{src['url']}/{oid}/attachments/{a['id']}"}
                    for a in g.get("attachmentInfos", [])]
    return out


def layer_metadata(src: dict) -> dict | None:
    d = _dir(src)
    p = d / "layer.json" if d else None
    return json.loads(p.read_text()) if p and p.exists() else None


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
    atts = load_attachments(src)
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
            if atts:
                r["attachments"] = atts.get(k, [])
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
    feats = client.query_features(src["url"], src.get("where", "1=1"), bbox,
                                  extra={"maxAllowableOffset": src["max_offset"]}
                                  if src.get("max_offset") else None)
    out = []
    for f in feats:
        g = f.get("geometry") or {}
        rec = {"attrs": f.get("attributes", {}), "lon": g.get("x"), "lat": g.get("y")}
        if "rings" in g:  # polygon (area sources): keep GeoJSON geometry + a label point
            geom = _rings_to_geojson(g["rings"])
            if geom and not shape(geom).is_empty:
                rec["geometry"] = geom
                pt = shape(geom).representative_point()
                rec["lon"], rec["lat"] = pt.x, pt.y
        out.append(rec)
    return out


def _rings_to_geojson(rings: list) -> dict | None:
    """Esri rings (outer rings clockwise, holes counter-clockwise) -> GeoJSON (Multi)Polygon."""
    from shapely.geometry import LinearRing, Polygon
    outers, holes = [], []
    for r in rings:
        if len(r) < 4:
            continue
        (outers if not LinearRing(r).is_ccw else holes).append(r)
    polys = []
    for o in outers:
        po = Polygon(o)
        inner = [h for h in holes if po.contains(Polygon(h).representative_point())]
        polys.append(Polygon(o, inner))
    if not polys:
        return None
    geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
    return mapping(geom.buffer(0))
