"""Generic lat/lon CSV import.

Required columns: lat, lon. Optional: native_id, source, tier, kind, type, date, depth_ft,
doc_url, doc_name, report_key, boring_name. Missing native_id falls back to the row number.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..config import ROOT


def fetch(src: dict, ctx, bbox) -> list[dict]:
    path = Path(src["path"])
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        raise FileNotFoundError(f"CSV source {src['id']}: {path} not found")
    df = pd.read_csv(path)
    if not {"lat", "lon"} <= set(df.columns):
        raise ValueError(f"CSV source {src['id']} needs lat and lon columns")
    if "native_id" not in df.columns:
        df["native_id"] = range(len(df))
    out = []
    for rec in df.to_dict("records"):
        rec = {k: (None if pd.isna(v) else v) for k, v in rec.items()}
        lon, lat = rec.get("lon"), rec.get("lat")
        if bbox and lon is not None and lat is not None:
            if not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]):
                continue
        out.append({"attrs": rec, "lon": lon, "lat": lat})
    return out
