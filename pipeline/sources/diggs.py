"""DIGGS adapter: boreholes, SPT N-values, lab tests and lithology from DIGGS 3 files.

Reads every `*.xml` (raw DIGGS) and `*.html` (Geosetta's DIGGS viewer export, which embeds the
XML) in the source's `import_dir`. Depths are in the file's linear-referencing units (feet in
Geosetta exports). Several boreholes can share one coordinate (Geosetta places borings from a
report without per-boring positions at the report's site), so a borehole's identity is its
Geosetta functional key `"{lat};{lon}"` plus a hash of its content; the same borehole in
overlapping exports is still read once.

If an HTML export starts with Geosetta's disclaimer comment, it is saved as DISCLAIMER.txt in
the import folder so the manifest and the map can carry it (Geosetta's terms require that).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from ..config import ROOT

log = logging.getLogger(__name__)

NS = {"d": "http://diggsml.org/schemas/3", "gml": "http://www.opengis.net/gml/3.2",
      "xlink": "http://www.w3.org/1999/xlink", "glr": "http://www.opengis.net/gml/3.3/lr"}
GID = "{http://www.opengis.net/gml/3.2}id"
HREF = "{http://www.w3.org/1999/xlink}href"
LAB = {"water_content_natural": "water_content_pct", "percent_fines": "fines_pct",
       "liquid_limit": "liquid_limit", "plastic_limit": "plastic_limit",
       "plasticity_index": "plasticity_index"}


def import_dir(src: dict) -> Path:
    d = Path(src["import_dir"])
    return d if d.is_absolute() else ROOT / d


def _xml_text(path: Path) -> tuple[str, str | None]:
    """Return (diggs_xml, disclaimer_or_None) from a .xml or Geosetta .html file."""
    t = path.read_text(encoding="utf-8", errors="replace")
    disclaimer = None
    m = re.search(r"<!--\s*GEOSETTA DISCLAIMER:\s*(.*?)-->", t, re.S)
    if m:
        disclaimer = " ".join(m.group(1).split())
    i = t.find("<Diggs")
    j = t.find("</Diggs>", i)
    if i < 0 or j < 0:
        raise ValueError(f"{path.name}: no <Diggs> document found")
    return t[i:j + len("</Diggs>")], disclaimer


def _href(e) -> str | None:
    return e.get(HREF).lstrip("#") if e is not None and e.get(HREF) else None


def _extent(e) -> tuple[float, float] | None:
    pl = e.find(".//gml:posList", NS)
    if pl is None or not (pl.text or "").split():
        return None
    v = [float(x) for x in pl.text.split()]
    return (v[0], v[-1])


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse_diggs(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    projects = {}
    for p in root.findall(".//d:Project", NS):
        name = p.findtext("gml:name", default=None, namespaces=NS)
        assoc = [b.findtext("gml:name", default="", namespaces=NS)
                 for b in p.findall(".//d:BusinessAssociate", NS)]
        projects[p.get(GID)] = {"name": name, "provider": next((a for a in assoc if a), None)}

    bh: dict[str, dict] = {}
    for b in root.findall(".//d:Borehole", NS):
        pos = (b.findtext(".//d:referencePoint//gml:pos", default="", namespaces=NS)).split()
        if len(pos) < 2:
            continue
        lat, lon = float(pos[0]), float(pos[1])
        proj = projects.get(_href(b.find("d:projectRef", NS)), {})
        bh[b.get(GID)] = {
            "fk": f"{pos[0]};{pos[1]}",
            "name": b.findtext("gml:name", default=None, namespaces=NS),
            "project": proj.get("name"),
            "provider": proj.get("provider"),
            "lat": lat, "lon": lon,
            "elev_ft": _num(pos[2]) if len(pos) > 2 else None,
            "total_depth_ft": _num(b.findtext("d:totalMeasuredDepth", default=None,
                                              namespaces=NS)),
            "n_values": [], "lithology": [], "lab": defaultdict(list),
            "groundwater_depth_ft": None, "test_types": set(), "max_extent_ft": 0.0,
        }

    def touch(rec, ext):
        if ext:
            rec["max_extent_ft"] = max(rec["max_extent_ft"], ext[1])

    for t in root.findall(".//d:Test", NS):
        rec = bh.get(_href(t.find("d:samplingFeatureRef", NS)))
        if rec is None:
            continue
        name = t.findtext("gml:name", default="", namespaces=NS)
        if name:
            rec["test_types"].add(name.strip())
        loc = t.find(".//d:TestResult/d:location", NS)
        ext = _extent(loc if loc is not None else t)
        touch(rec, ext)
        cls = t.findtext(".//d:propertyClass", default="", namespaces=NS).strip()
        val = _num(t.findtext(".//d:dataValues", default=None, namespaces=NS))
        if val is None:
            continue
        if cls == "n_value" and ext:
            rec["n_values"].append([ext[0], ext[1], val])
        elif cls == "groundwater_depth":
            rec["groundwater_depth_ft"] = val
        elif cls in LAB and ext:
            rec["lab"][LAB[cls]].append([ext[0], ext[1], val])

    for s in root.findall(".//d:LithologySystem", NS):
        rec = bh.get(_href(s.find("d:samplingFeatureRef", NS)))
        if rec is None:
            continue
        for o in s.findall(".//d:LithologyObservation", NS):
            ext = _extent(o.find("d:location", NS))
            desc = o.findtext(".//d:lithDescription", default="", namespaces=NS).strip()
            sym = (o.findtext(".//d:classificationSymbol", default=None, namespaces=NS)
                   or None)
            if not ext or not desc or desc.lower().startswith("bottom of bor"):
                continue
            touch(rec, ext)
            rec["lithology"].append([ext[0], ext[1], sym, desc])

    out = []
    for rec in bh.values():
        rec["n_values"].sort()
        rec["lithology"].sort(key=lambda x: x[0])
        depths = [d for d in (rec["total_depth_ft"], rec.pop("max_extent_ft")) if d]
        rec["depth_ft"] = max(depths) if depths else None
        rec["test_type"] = ("SPT" if rec["n_values"] or "SPT" in rec["test_types"]
                            else ",".join(sorted(rec["test_types"])) or None)
        rec["test_types"] = sorted(rec["test_types"])
        rec["lab"] = dict(rec["lab"])
        digest = hashlib.sha1(json.dumps(
            [rec["project"], rec["name"], rec["n_values"], rec["lithology"], rec["depth_ft"]],
            default=str).encode()).hexdigest()[:8]
        rec["uid"] = f"{rec['fk']}#{digest}"
        # Geosetta places borings without per-boring coordinates at a geocoded report site, and
        # writes those with <= 4 decimals (~10 m). Several such sites in Gainesville were
        # visibly misplaced (checked 2026-11-16), so mark them approximate.
        lat_s, lon_s = rec["fk"].split(";")
        decimals = min(len(x.split(".")[1]) if "." in x else 0 for x in (lat_s, lon_s))
        rec["flags"] = ["approx_location"] if decimals <= 4 else []
        rec["log"] = {"units": "ft", "n_values": rec["n_values"], "lithology": rec["lithology"],
                      "lab": rec["lab"], "groundwater_depth_ft": rec["groundwater_depth_ft"],
                      "via": "Geosetta (DIGGS)", "provider": rec["provider"]}
        out.append(rec)
    return out


def fetch(src: dict, ctx, bbox) -> list[dict]:
    d = import_dir(src)
    files = sorted([*d.glob("*.xml"), *d.glob("*.html")]) if d.exists() else []
    if not files:
        raise FileNotFoundError(f"no DIGGS .xml/.html files in {d}")
    seen: dict[str, dict] = {}
    disclaimer = None
    for f in files:
        xml, disc = _xml_text(f)
        disclaimer = disclaimer or disc
        recs = parse_diggs(xml)
        log.info("  %s: %d boreholes in %s", src["id"], len(recs), f.name)
        for r in recs:
            seen.setdefault(r["uid"], r)
    if disclaimer:
        (d / "DISCLAIMER.txt").write_text(disclaimer + "\n")
    # Several distinct boreholes on one exact coordinate = report-site placement, not as-drilled.
    from collections import Counter
    shared = Counter(r["fk"] for r in seen.values())
    for r in seen.values():
        if shared[r["fk"]] > 1 and "approx_location" not in r["flags"]:
            r["flags"].append("approx_location")
    out = []
    for r in seen.values():
        if bbox and not (bbox[0] <= r["lon"] <= bbox[2] and bbox[1] <= r["lat"] <= bbox[3]):
            continue
        out.append({"attrs": r, "lon": r["lon"], "lat": r["lat"]})
    return out
