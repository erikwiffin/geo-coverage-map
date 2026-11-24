"""Area-based coverage on an H3 grid (SPEC §6.1). Python is the authoritative implementation."""
from __future__ import annotations

from dataclasses import dataclass

import h3
import numpy as np
import pandas as pd
from shapely.geometry import mapping

from .geo import SphereIndex


@dataclass
class Grid:
    cells: list[str]
    lon: np.ndarray
    lat: np.ndarray
    area_m2: np.ndarray
    resolution: int


def make_grid(boundary_geom, resolution: int) -> Grid:
    cells = sorted(h3.geo_to_cells(mapping(boundary_geom), resolution))  # center containment
    ll = np.array([h3.cell_to_latlng(c) for c in cells]) if cells else np.empty((0, 2))
    area = np.array([h3.cell_area(c, "m^2") for c in cells])
    return Grid(cells, ll[:, 1], ll[:, 0], area, resolution)


@dataclass
class Filters:
    max_tier: int = 4
    types: tuple[str, ...] | None = None          # None = all
    sources: tuple[str, ...] | None = None        # None = all default-on sources
    exclude_kinds: tuple[str, ...] = ()
    min_year: int | None = None
    include_undated: bool = True

    def mask(self, df: pd.DataFrame) -> np.ndarray:
        m = (df["tier"] <= self.max_tier).to_numpy().copy()
        if self.types is not None:
            m &= df["boring_type"].isin(self.types).to_numpy()
        if self.sources is not None:
            m &= df["source_id"].isin(self.sources).to_numpy()
        if self.exclude_kinds:
            m &= ~df["kind"].isin(self.exclude_kinds).to_numpy()
        if "flags" in df:  # drawn but never counted (see normalize.NO_COVERAGE_FLAG)
            m &= ~df["flags"].map(_no_coverage).to_numpy(dtype=bool)
        if self.min_year is not None:
            yr = df["year"]
            m &= ((yr >= self.min_year) | (yr.isna() & self.include_undated)).to_numpy()
        elif not self.include_undated:
            m &= df["year"].notna().to_numpy()
        return m


def _no_coverage(flags) -> bool:
    if flags is None or isinstance(flags, float):
        return False
    return "not_site_data" in (flags.split(",") if isinstance(flags, str) else list(flags))


def nearest_distance(grid: Grid, borings: pd.DataFrame) -> np.ndarray:
    idx = SphereIndex(borings["lon"].to_numpy(), borings["lat"].to_numpy())
    return idx.nearest_m(grid.lon, grid.lat)


def pct_covered(dist: np.ndarray, area: np.ndarray, radius_m: float) -> float:
    if not len(dist):
        return 0.0
    return float(100 * area[dist <= radius_m].sum() / area.sum())


def curve(dist, area, radii) -> dict[str, float]:
    return {str(r): round(pct_covered(dist, area, r), 3) for r in radii}


def report_counts(grid: Grid, borings: pd.DataFrame, radius_m: float) -> np.ndarray:
    keyed = borings[borings["report_key"].notna()]
    if keyed.empty:
        return np.zeros(len(grid.cells), dtype=int)
    idx = SphereIndex(keyed["lon"].to_numpy(), keyed["lat"].to_numpy())
    keys = keyed["report_key"].to_numpy()
    hits = idx.within(grid.lon, grid.lat, radius_m)
    return np.array([len(set(keys[h])) if h else 0 for h in hits], dtype=int)


def find_gaps(grid: Grid, dist: np.ndarray, radius_m: float, top_n: int = 10) -> list[dict]:
    uncovered = {c for c, d in zip(grid.cells, dist, strict=True) if d > radius_m}
    pos = {c: i for i, c in enumerate(grid.cells)}
    seen: set[str] = set()
    clusters = []
    for start in uncovered:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            c = stack.pop()
            comp.append(c)
            for n in h3.grid_disk(c, 1):
                if n in uncovered and n not in seen:
                    seen.add(n)
                    stack.append(n)
        ii = np.array([pos[c] for c in comp])
        a = grid.area_m2[ii]
        clusters.append({
            "area_km2": round(float(a.sum()) / 1e6, 4),
            "n_cells": len(comp),
            "centroid_lon": round(float(np.average(grid.lon[ii], weights=a)), 6),
            "centroid_lat": round(float(np.average(grid.lat[ii], weights=a)), 6),
            "max_distance_m": round(float(dist[ii].max()), 1) if np.isfinite(dist[ii]).all()
            else None,
            "cells": sorted(comp),
        })
    clusters.sort(key=lambda c: -c["area_km2"])
    for rank, c in enumerate(clusters[:top_n], 1):
        c["rank"] = rank
    return clusters[:top_n]


def compute_stats(grid: Grid, borings: pd.DataFrame, area_cfg: dict,
                  default_sources: list[str]) -> tuple[dict, dict]:
    """Return (stats_json, extras) where extras holds arrays for plotting."""
    radii = area_cfg["radii_m"]
    base = Filters(sources=tuple(default_sources))
    default_df = borings[base.mask(borings)]
    dist = nearest_distance(grid, default_df)
    total_km2 = float(grid.area_m2.sum()) / 1e6

    if "pseudo" not in borings:
        borings = borings.assign(pseudo=False)
    by_tier, curves = {}, {}
    for t in (1, 2, 3, 4):
        f = Filters(max_tier=t, sources=tuple(default_sources))
        d = nearest_distance(grid, borings[f.mask(borings)])
        by_tier[f"<={t}"] = curve(d, grid.area_m2, radii)
        curves[f"tier ≤ {t}"] = d

    type_sets = {
        "all": Filters(sources=tuple(default_sources)),
        "spt_cpt": Filters(types=("SPT", "CPT"), sources=tuple(default_sources)),
        "excluding_wells": Filters(types=("SPT", "CPT", "Auger", "Other", "Document"),
                                   sources=tuple(default_sources)),
    }
    by_type = {k: curve(nearest_distance(grid, borings[f.mask(borings)]), grid.area_m2, radii)
               for k, f in type_sets.items()}

    by_recency = {"all_years": curve(dist, grid.area_m2, radii)}
    for y in area_cfg.get("recency_years", [2000, 2015]):
        f = Filters(sources=tuple(default_sources), min_year=y, include_undated=False)
        by_recency[f"{y}_and_later"] = curve(
            nearest_distance(grid, borings[f.mask(borings)]), grid.area_m2, radii)

    rc_r = area_cfg.get("report_count_radius_m", 250)
    rc = report_counts(grid, default_df, rc_r)
    gaps = find_gaps(grid, dist, area_cfg.get("gap_radius_m", 500), area_cfg.get("gaps_top_n", 10))

    # every configured source, wells included: lets the web consistency test exercise real data
    # even when the default-on sources are empty.
    all_src = Filters(sources=None)
    geo_only = Filters(sources=tuple(default_sources),
                       exclude_kinds=("geologic_well", "environmental_site", "permit_site"))
    dist_geo = nearest_distance(grid, borings[geo_only.mask(borings)])
    dist_all = nearest_distance(grid, borings[all_src.mask(borings)])
    # default sources plus environmental cleanup sites: how much do FDEP files add?
    env_ids = tuple(borings.loc[borings["kind"] == "environmental_site", "source_id"].unique())
    with_env = Filters(sources=tuple(default_sources) + env_ids,
                       exclude_kinds=("geologic_well", "permit_site"))
    dist_env = nearest_distance(grid, borings[with_env.mask(borings)])
    permit_ids = tuple(borings.loc[borings["kind"] == "permit_site", "source_id"].unique())
    with_permits = Filters(sources=tuple(default_sources) + permit_ids,
                           exclude_kinds=("geologic_well", "environmental_site"))
    dist_permits = nearest_distance(grid, borings[with_permits.mask(borings)])

    finite = dist[np.isfinite(dist)]
    stats = {
        "area_id": area_cfg["id"],
        "h3_resolution": grid.resolution,
        "n_cells": len(grid.cells),
        "area_km2": round(total_km2, 3),
        "radii_m": radii,
        "default_radius_m": area_cfg.get("default_radius_m", 250),
        "default_filters": {"max_tier": 4, "types": "all", "sources": default_sources,
                            "years": "all, incl. undated"},
        "n_borings_default": int(len(default_df) - int(default_df.get("pseudo", pd.Series(
            dtype=bool)).fillna(False).astype(bool).sum())),
        "n_reports_default": int(default_df["report_key"].nunique()),
        "median_nearest_m": round(float(np.median(finite)), 1) if len(finite) else None,
        "pct_covered": curve(dist, grid.area_m2, radii),
        "pct_covered_all_sources": curve(dist_all, grid.area_m2, radii),
        "pct_covered_geotechnical_only": curve(dist_geo, grid.area_m2, radii),
        "pct_covered_with_environmental_sites": curve(dist_env, grid.area_m2, radii),
        "pct_covered_with_permit_sites": curve(dist_permits, grid.area_m2, radii),
        "pct_covered_by_tier": by_tier,
        "pct_covered_by_type": by_type,
        "pct_covered_by_recency": by_recency,
        "reports_within_radius": {
            "radius_m": rc_r,
            "median": float(np.median(rc)) if len(rc) else 0,
            "p90": float(np.percentile(rc, 90)) if len(rc) else 0,
            "pct_cells_zero": round(float(100 * (rc == 0).mean()), 2) if len(rc) else 100,
        },
        "gaps": {"radius_m": area_cfg.get("gap_radius_m", 500),
                 "top": [{k: v for k, v in g.items() if k != "cells"} for g in gaps]},
    }
    return stats, {"curves": curves, "gaps": gaps, "dist": dist, "report_counts": rc}


def plot_curve(curves: dict, area_m2, path, title: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    radii = np.linspace(0, 1500, 151)
    fig, ax = plt.subplots(figsize=(7, 4.2), dpi=150)
    styles = ["-", "--", "-.", ":"]
    for (label, d), ls in zip(curves.items(), styles, strict=False):
        ax.plot(radii, [pct_covered(d, area_m2, r) for r in radii], ls, lw=2, label=label)
    ax.set_xlabel("Radius R (m)")
    ax.set_ylabel("% of city area within R of a boring")
    ax.set_ylim(0, 100)
    ax.set_xlim(0, 1500)
    ax.grid(alpha=0.3)
    ax.set_title(title)
    ax.legend(title="Cumulative license tier", loc="lower right")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
