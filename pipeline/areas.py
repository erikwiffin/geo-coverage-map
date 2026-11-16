"""Area sources: permit or site polygons that mark where subsurface information likely exists.

An area counts toward coverage through the H3 cells it overlaps, at the coverage resolution: each
such cell's centre becomes a *pseudo-point* carrying the area's tier, source, kind, year and
report key. The existing nearest-distance and report-count machinery (Python and web) then works
unchanged. Cells inside the area are at distance 0. Outside, the distance to the nearest
overlapped cell centre is within about one cell radius of the true distance to the polygon.

Records come from the ArcGIS adapter with a GeoJSON `geometry`. Config keys:
  area_group_by   field whose value identifies one area (e.g. permit id); its sequences are
                  dissolved into one polygon, keeping the most recent record's attributes
  area_exclude    {field: [values]} records to drop (e.g. PRMT_STTS: [Never Issued])
  area_date       date field used for year filtering (epoch ms or string)
  max_coverage_acres  larger areas are drawn but contribute no pseudo-points (a master permit
                  for a whole campus doesn't mean borings everywhere on it)
"""
from __future__ import annotations

import json
import numbers

import geopandas as gpd
import h3
import pandas as pd
import shapely
from shapely.geometry import mapping, shape

from .normalize import _clean, _fmt, parse_date

ACRE_M2 = 4046.8564224


def build_areas(records: list[dict], src: dict, resolution: int) -> gpd.GeoDataFrame:
    excl = src.get("area_exclude") or {}
    rows = []
    for r in records:
        a, g = r["attrs"], r.get("geometry")
        if not g or any(_clean(a.get(f)) in vals for f, vals in excl.items()):
            continue
        geom = shape(g)
        if geom.is_empty:
            continue
        rows.append({**a, "_geom": shapely.make_valid(geom)})
    cols = ["area_uid", "source_id", "tier", "kind", "boring_type", "name", "report_key",
            "date", "year", "doc_url", "details", "acres", "n_records", "counts_toward_coverage",
            "cells", "geometry"]
    if not rows:
        return gpd.GeoDataFrame(columns=cols, geometry="geometry", crs=4326)
    df = pd.DataFrame(rows)
    key = src.get("area_group_by") or src.get("field_map", {}).get("native_id", "OBJECTID")
    datef = src.get("area_date")
    df["_ts"] = df[datef].fillna(0) if datef else 0
    fm = src.get("field_map", {})
    utm = gpd.GeoSeries(df["_geom"], crs=4326).estimate_utm_crs()
    max_ac = src.get("max_coverage_acres")
    out = []
    for k, g in df.groupby(key, sort=True):
        g = g.sort_values("_ts")
        latest = g.iloc[-1]
        geom = shapely.union_all(list(g["_geom"]))
        acres = float(gpd.GeoSeries([geom], crs=4326).to_crs(utm).area.iloc[0]) / ACRE_M2
        raw_date = _clean(latest.get(datef)) if datef else None
        iso, year, _ = parse_date(raw_date)
        counts = not (max_ac and acres > max_ac)
        cells = sorted(h3.compact_cells(set(h3.h3shape_to_cells_experimental(
            h3.geo_to_h3shape(mapping(geom)), resolution, contain="overlap")))) if counts else []
        details = {lbl: _detail(latest[f]) for lbl, f in (src.get("details") or {}).items()
                   if f in latest and _clean(latest[f]) is not None}
        details["Records (sequences)"] = len(g)
        out.append({
            "area_uid": f"{src['id']}:{_fmt(k)}",
            "source_id": src["id"], "tier": int(src["tier"]), "kind": src["kind"],
            "boring_type": src.get("fixed_type", "Permit"),
            "name": _clean(latest.get(fm.get("boring_name"))) if fm.get("boring_name") else None,
            "report_key": f"{src['id']}:{_fmt(k)}",
            "date": iso, "year": year,
            "doc_url": _clean(latest.get(fm.get("doc_url"))) if fm.get("doc_url") else None,
            "details": json.dumps(details, default=str),
            "acres": round(acres, 2), "n_records": len(g),
            "counts_toward_coverage": counts,
            "cells": ",".join(cells),
            "geometry": geom,
        })
    return gpd.GeoDataFrame(out, columns=cols, geometry="geometry", crs=4326)


def _detail(v):
    """Display value: ArcGIS epoch-ms dates become ISO dates."""
    if isinstance(v, numbers.Number) and not isinstance(v, bool) and abs(v) > 1e11:
        iso, _, _ = parse_date(float(v))
        if iso:
            return iso
    return _fmt(v)


def pseudo_points(areas: pd.DataFrame, resolution: int) -> pd.DataFrame:
    """One row per covered H3 cell centre, shaped like the borings table for coverage maths."""
    rows = []
    for a in areas.itertuples():
        if not a.cells:
            continue
        for c in h3.uncompact_cells(a.cells.split(","), resolution):
            lat, lon = h3.cell_to_latlng(c)
            rows.append((lon, lat, a.source_id, a.tier, a.kind, a.boring_type, a.year,
                         a.report_key))
    return pd.DataFrame(rows, columns=["lon", "lat", "source_id", "tier", "kind", "boring_type",
                                       "year", "report_key"])
