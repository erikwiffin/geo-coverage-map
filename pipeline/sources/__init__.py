"""Source adapters. Each adapter exposes fetch(source_cfg, ctx) -> list[dict] of raw records.

A raw record is {"attrs": {...native attributes...}, "lon": float|None, "lat": float|None}.
"""
from collections.abc import Callable

from . import arcgis_points, csv_source, diggs, geosetta, usgs_nwis

ADAPTERS: dict[str, Callable] = {
    "arcgis": arcgis_points.fetch,
    "csv": csv_source.fetch,
    "diggs": diggs.fetch,
    "usgs_nwis": usgs_nwis.fetch,
    "geosetta": geosetta.fetch,
}
