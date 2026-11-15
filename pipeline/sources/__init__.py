"""Source adapters. Each adapter exposes fetch(source_cfg, ctx) -> list[dict] of raw records.

A raw record is {"attrs": {...native attributes...}, "lon": float|None, "lat": float|None}.
"""
from collections.abc import Callable

from . import arcgis_points, csv_source, geosetta

ADAPTERS: dict[str, Callable] = {
    "arcgis": arcgis_points.fetch,
    "csv": csv_source.fetch,
    "geosetta": geosetta.fetch,
}
