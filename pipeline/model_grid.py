"""Geosetta model products on a representative grid over the city (not borings).

Geosetta's predictions, seismic site class and site reports are point lookups, not datasets, so
we sample them at the centres of H3 cells (resolution `model_grid.h3_resolution`, default 8:
~0.74 km² cells, ~0.9 km apart, 246 cells in Gainesville) and draw each cell with its answer.

Requests (all cached in data/raw/geosetta/, rate limited by GeosettaClient):
- SPT_Point_Prediction: 10 points per data-API call (25 calls for 246 cells). The API takes up
  to 50, but a 50-point request timed out after 180 s on 2026-11-24.
- /web_map/api/site_class/{lat}/{lng}/: one GET per cell.
- /web_map/api/generate_site_report/ (format json): one POST per *parent* cell (resolution
  `site_report_h3_resolution`, default 7: ~5 km², 53 cells), with that cell's polygon; each
  grid cell shows its parent's report. Each takes ~23 s, and Geosetta throttles after about 30
  per hour (bare HTTP 403), so a full res-8 run would take 8 hours. The report is mostly
  regional context (geology, karst, terrain screening), so the coarser sample suits it.
A 429 (daily quota) stops that product; what's cached is kept and the next run resumes.

Everything here is a machine-learning or GIS-derived estimate, not a measurement. It never
counts toward coverage, and Geosetta's disclaimer must travel with it.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import h3
from shapely.geometry import mapping, shape

from .geosetta_api import NotCached, QuotaExceeded, client_for

log = logging.getLogger(__name__)

N_ORDER = ["0", "1-9", "10-25", "26-41", "42-50", "50+"]
FINE_USCS = {"CL", "CH", "ML", "MH", "OL", "OH", "CL-ML", "PT"}


def grid_cells(boundary_geom, res: int) -> list[str]:
    return sorted(h3.geo_to_cells(mapping(boundary_geom), res))


def _cell_polygon(cell: str) -> dict:
    ring = [[lng, lat] for lat, lng in h3.cell_to_boundary(cell)]
    return {"type": "Polygon", "coordinates": [ring + [ring[0]]]}


# ---------------------------------------------------------------------- summaries
def summarize_prediction(r: dict) -> dict:
    prof = r.get("profiles") or []
    out: dict = {"nearest_trained_mi": (r.get("point") or {}).get(
        "minimum_distance_from_trained_point_(mi)")}
    layers = []
    for row in prof:
        d = row.get("depth_ft")
        desc = row.get("soil_description") or row.get("rock_type") or row.get("geomaterial")
        sym = row.get("USCS_groupSymbol")
        n = row.get("dominant_N_value")
        if layers and layers[-1][3] == desc:
            layers[-1][1] = d
            layers[-1][4].append(n)
        else:
            layers.append([d, d, sym, desc, [n]])
    # one N bucket per layer: the most common one
    out["layers"] = [[a, b, s, t, max(set(ns), key=ns.count) if ns else None]
                     for a, b, s, t, ns in layers]

    def first(pred):
        return next((row["depth_ft"] for row in prof if pred(row)), None)

    # a clay (or silt) layer: fine-grained USCS class, or clay/silt as the dominant grain. Clayey
    # sand (SC) doesn't count: the model predicts SC from the surface in every Gainesville cell
    # (checked 2026-11-24), so "depth to SC" would read 0 ft everywhere.
    out["depth_fines_ft"] = first(lambda x: x.get("USCS_groupSymbol") in FINE_USCS
                                  or x.get("dominant_grain_size") in ("CLAY", "SILT"))
    # what does vary: the model's probability that the upper 10 ft is clay-rich
    top = [x for x in prof if (x.get("depth_ft") or 0) <= 10]

    def mean_prob(get):
        v = [get(x.get("lab_predictions") or {}) for x in top]
        v = [p for p in v if p is not None]
        return round(100 * sum(v) / len(v), 1) if v else None

    out["fines_top10_pct"] = mean_prob(lambda lp: (lp.get("fines_probs") or {}).get("Fine-grained"))
    syms = [x["USCS_groupSymbol"] for x in top if x.get("USCS_groupSymbol")]
    out["top_uscs"] = max(set(syms), key=syms.count) if syms else None  # most common, 0-10 ft
    out["depth_n10_ft"] = first(lambda x: x.get("dominant_N_value") in N_ORDER[2:])
    out["depth_rock_ft"] = first(lambda x: (x.get("geomaterial") or "").upper() == "ROCK"
                                 or bool(x.get("rock_type")))
    out["max_depth_ft"] = prof[-1]["depth_ft"] if prof else None
    gw = r.get("groundwater") or {}
    out["gw_category"] = gw.get("depth_category")
    out["gw_label"] = gw.get("depth_label")
    out["gw_probs"] = gw.get("depth_probabilities")
    c = r.get("confidence") or {}
    out["confidence"] = c.get("average")
    out["confidence_level"] = c.get("level")
    bs = c.get("boring_stats") or {}
    out["borings_500m"] = bs.get("count_500m")
    out["borings_1mi"] = bs.get("count_1mi")
    out["nearest_boring_m"] = bs.get("nearest_distance_m")
    return out


def summarize_site_class(b: dict) -> dict:
    if not isinstance(b, dict) or b.get("status") != "success":
        return {}
    sc, vs = b.get("site_class") or {}, b.get("vs30_ft_s") or {}
    lo, hi = sc.get("lower_bound"), sc.get("upper_bound")
    return {"site_class": lo if lo == hi else f"{hi}–{lo}" if lo and hi else lo or hi,
            "site_class_lower": lo, "site_class_upper": hi, "vs30_ft_s": vs.get("average"),
            "vs30_range": [vs.get("lower_bound"), vs.get("upper_bound")]}


def summarize_site_report(b: dict) -> dict:
    if not isinstance(b, dict) or b.get("status") != "success":
        return {}
    d = b.get("data") or {}
    geo, karst, soils = d.get("geology") or {}, d.get("karst") or {}, d.get("soils") or {}
    terr = (d.get("terrain") or {}).get("hazards") or {}
    mines, bh = d.get("mines") or {}, d.get("boreholes") or {}
    return {
        "address": (d.get("polygon") or {}).get("address"),
        "geology": geo.get("formation") or geo.get("unit_name"),
        "geology_lithology": geo.get("generalized_lithology"),
        "karst": karst.get("in_karst_area"),
        "karst_type": karst.get("karst_type"),
        "sinkhole_risk": terr.get("sinkhole_risk"),
        "slope_susceptibility": terr.get("slope_susceptibility"),
        "terrain_hazard": terr.get("overall_hazard_level"),
        "hazard_flags": terr.get("hazard_flags"),
        "mines_2mi": mines.get("total_count"),
        "soil_order": soils.get("soil_type"),
        "soil_source": soils.get("data_source"),
        "geosetta_borings_5mi": bh.get("total_count"),
    }


# ---------------------------------------------------------------------- fetch / build
def _run(ctx, boundary_geom, offline: bool) -> tuple[list[dict], dict]:
    cfg = ctx.area.get("model_grid") or {}
    res = int(cfg.get("h3_resolution", 8))
    depth = int(cfg.get("depth_ft", 50))
    cells = grid_cells(boundary_geom, res)
    c = client_for(ctx, offline=offline)
    rows = {cell: {"cell": cell, "lat": round(h3.cell_to_latlng(cell)[0], 6),
                   "lon": round(h3.cell_to_latlng(cell)[1], 6)} for cell in cells}
    status: dict = {"h3_resolution": res, "n_cells": len(cells), "depth_ft": depth}
    disclaimer = None

    def guarded(name, fn):
        nonlocal disclaimer
        done = 0
        try:
            done = fn()
            status[name] = {"status": "ok", "n": done}
        except QuotaExceeded as e:
            status[name] = {"status": "partial", "n": done, "reason": str(e)}
            log.warning("model grid %s stopped: %s", name, e)
        except NotCached:
            n = sum(1 for r in rows.values() if r.get(f"_{name}"))
            status[name] = {"status": "partial" if n else "skipped", "n": n,
                            "reason": "not in cache (needs GEOSETTA_API_KEY and a fetch)"}

    def predictions():
        nonlocal disclaimer
        batch = int(cfg.get("prediction_batch", 10))  # 50 (the API max) timed out at 180 s
        for i in range(0, len(cells), batch):
            chunk = cells[i:i + batch]
            pts = [{"latitude": round(h3.cell_to_latlng(x)[0], 6),
                    "longitude": round(h3.cell_to_latlng(x)[1], 6),
                    "depth": depth, "surfaceelevation": None} for x in chunk]
            b = c.deliverable("SPT_Point_Prediction", {"points": pts}, kind="predictions")["body"]
            disclaimer = disclaimer or b.get("disclaimer")
            for cell, r in zip(chunk, b.get("results") or [], strict=False):
                rows[cell].update(summarize_prediction(r))
                rows[cell]["elev_ft"] = (r.get("point") or {}).get("elevation_ft")
                rows[cell]["_predictions"] = True
        return sum(1 for r in rows.values() if r.get("_predictions"))

    def site_class():
        n = 0
        for cell in cells:
            lat, lng = h3.cell_to_latlng(cell)
            b = c.request("GET", f"/web_map/api/site_class/{lat:.6f}/{lng:.6f}/",
                          kind="site_class")["body"]
            s = summarize_site_class(b)
            if s:
                rows[cell].update(s)
                rows[cell]["_site_class"] = True
                n += 1
        return n

    def site_report():
        pres = int(cfg.get("site_report_h3_resolution", 7))
        parents: dict[str, list[str]] = {}
        for cell in cells:
            parents.setdefault(h3.cell_to_parent(cell, pres) if pres < res else cell,
                               []).append(cell)
        status["site_report_h3_resolution"] = pres
        n = 0
        for i, (parent, kids) in enumerate(sorted(parents.items())):
            b = c.request("POST", "/web_map/api/generate_site_report/", kind="site_report",
                          bucket="site_report",
                          json_body={"geojson": _cell_polygon(parent), "format": "json"})["body"]
            s = summarize_site_report(b)
            if s:
                for cell in kids:
                    rows[cell].update(s, site_report_cell=parent)
                    rows[cell]["_site_report"] = True
                n += 1
            if not offline and i % 10 == 0:
                log.info("  site reports: %d/%d", i + 1, len(parents))
        status["site_report_cells"] = len(parents)
        return n

    products = cfg.get("products", ["predictions", "site_class", "site_report"])
    for name, fn in (("predictions", predictions), ("site_class", site_class),
                     ("site_report", site_report)):
        if name in products:
            guarded(name, fn)
    status["calls"], status["cache_hits"] = c.calls, c.cache_hits
    status["disclaimer"] = disclaimer
    return list(rows.values()), status


def fetch(ctx, boundary_geom) -> dict:
    _, status = _run(ctx, boundary_geom, offline=False)
    return status


def build(ctx, boundary_geom) -> dict:
    """Cache-only: write model_grid.geojson from cached responses. Returns the manifest entry."""
    rows, status = _run(ctx, boundary_geom, offline=True)
    feats = []
    for r in rows:
        if not any(r.get(k) for k in ("_predictions", "_site_class", "_site_report")):
            continue
        props = {k: v for k, v in r.items() if not k.startswith("_") and v is not None}
        for k in ("layers", "gw_probs", "hazard_flags", "vs30_range"):
            if k in props:
                props[k] = json.dumps(props[k])
        feats.append({"type": "Feature", "properties": props,
                      "geometry": _cell_polygon(r["cell"])})
    (ctx.out_dir / "model_grid.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    status["n_features"] = len(feats)
    status["built"] = datetime.now(UTC).isoformat(timespec="seconds")
    status["status"] = "ok" if feats else "skipped"
    return status


def boundary(ctx):
    return shape(json.loads((ctx.out_dir / "boundary.geojson").read_text())
                 ["features"][0]["geometry"])
