"""USGS NWIS site service adapter (groundwater sites with well depth).

Queries https://waterservices.usgs.gov/nwis/site/ with the area's bounding box and
siteOutput=expanded, which returns tab-separated RDB: a block of `#` comment lines, a header
row, a field-width row, then data rows. US federal data: public domain (tier 1).
"""
from __future__ import annotations

from ..arcgis import make_client

SITE_URL = "https://waterservices.usgs.gov/nwis/site/"


def parse_rdb(text: str) -> list[dict]:
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    rows = []
    for ln in lines[2:]:  # skip the field-width row
        vals = ln.split("\t")
        rows.append({h: (v.strip() or None) for h, v in zip(header, vals, strict=False)})
    return rows


def fetch(src: dict, ctx, bbox) -> list[dict]:
    if not bbox:
        raise ValueError("usgs_nwis needs a bounding box")
    params = {"format": "rdb", "bBox": ",".join(f"{v:.5f}" for v in bbox),
              "siteType": src.get("site_type", "GW"), "siteOutput": "expanded",
              "siteStatus": "all"}
    text = make_client(ctx).request(src.get("url", SITE_URL), params, text=True)
    out = []
    for r in parse_rdb(text):
        try:
            lon, lat = float(r["dec_long_va"]), float(r["dec_lat_va"])
        except (TypeError, ValueError, KeyError):
            continue
        r["page_url"] = f"https://waterdata.usgs.gov/monitoring-location/{r['site_no']}/"
        r["depth_ft"] = r.get("well_depth_va") or r.get("hole_depth_va")
        out.append({"attrs": r, "lon": lon, "lat": lat})
    return out
