"""Generic ArcGIS point-layer adapter (FDOT soil borings, FGS wells, ...)."""
from __future__ import annotations

from ..arcgis import make_client


def fetch(src: dict, ctx, bbox) -> list[dict]:
    client = make_client(ctx)
    feats = client.query_features(src["url"], src.get("where", "1=1"), bbox)
    out = []
    for f in feats:
        g = f.get("geometry") or {}
        out.append({"attrs": f.get("attributes", {}), "lon": g.get("x"), "lat": g.get("y")})
    return out
