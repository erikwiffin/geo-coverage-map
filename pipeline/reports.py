"""Group borings into reports and build footprints (SPEC §2, M2)."""
from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import MultiPoint, mapping
from shapely.ops import unary_union

from .geo import haversine_m


def _max_span_m(lon: np.ndarray, lat: np.ndarray) -> float:
    if len(lon) < 2:
        return 0.0
    pts = np.column_stack([lon, lat])
    if len(pts) > 3:
        hull = MultiPoint(pts).convex_hull
        if hull.geom_type == "Polygon":
            pts = np.asarray(hull.exterior.coords)
        elif hull.geom_type == "LineString":
            pts = np.asarray(hull.coords)
    a, b = np.triu_indices(len(pts), 1)
    return float(haversine_m(pts[a, 0], pts[a, 1], pts[b, 0], pts[b, 1]).max())


def build_reports(borings: pd.DataFrame, buffer_m: float = 30,
                  span_flag_km: float = 5) -> gpd.GeoDataFrame:
    keyed = borings[borings["report_key"].notna()]
    cols = ["report_key", "source_id", "tier", "kind", "doc_name", "doc_url", "n_borings",
            "types", "date_min", "date_max", "year_min", "year_max", "span_m", "flag_span",
            "centroid_lon", "centroid_lat", "hull", "geometry"]
    if keyed.empty:
        return gpd.GeoDataFrame(columns=cols, geometry="geometry", crs=4326)
    pts = gpd.GeoDataFrame(keyed, geometry=gpd.points_from_xy(keyed.lon, keyed.lat), crs=4326)
    utm = pts.estimate_utm_crs()
    pts_m = pts.to_crs(utm)
    rows = []
    for key, g in pts_m.groupby("report_key", sort=True):
        foot = unary_union(g.geometry.buffer(buffer_m, quad_segs=8))
        hull = MultiPoint(list(g.geometry)).convex_hull if len(g) >= 3 else None
        if hull is not None and hull.geom_type != "Polygon":
            hull = None
        cen = MultiPoint(list(g.geometry)).centroid
        span = _max_span_m(g["lon"].to_numpy(), g["lat"].to_numpy())
        dates = g["date"].dropna()
        years = g["year"].dropna()
        rows.append({
            "report_key": key,
            "source_id": g["source_id"].iloc[0],
            "tier": int(g["tier"].min()),
            "kind": g["kind"].iloc[0],
            "doc_name": g["doc_name"].dropna().iloc[0] if g["doc_name"].notna().any() else None,
            "doc_url": g["doc_url"].dropna().iloc[0] if g["doc_url"].notna().any() else None,
            "n_borings": int(len(g)),
            "types": sorted(g["boring_type"].unique().tolist()),
            "date_min": dates.min() if len(dates) else None,
            "date_max": dates.max() if len(dates) else None,
            "year_min": int(years.min()) if len(years) else None,
            "year_max": int(years.max()) if len(years) else None,
            "span_m": round(span, 1),
            "flag_span": span > span_flag_km * 1000,
            "_cen": cen, "_hull": hull, "geometry": foot,
        })
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=utm)
    cen = gpd.GeoSeries(out.pop("_cen"), crs=utm).to_crs(4326)
    hulls = gpd.GeoSeries(out.pop("_hull"), crs=utm)
    hulls_ll = hulls.to_crs(4326)
    out["centroid_lon"] = cen.x.round(6)
    out["centroid_lat"] = cen.y.round(6)
    out["hull"] = [None if h is None or h.is_empty else mapping(h) for h in hulls_ll]
    return out.to_crs(4326)[cols]
