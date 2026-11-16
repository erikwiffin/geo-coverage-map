import math

import numpy as np
import pandas as pd
import pytest
from shapely.geometry import Point

from pipeline.coverage import Filters, find_gaps, make_grid, nearest_distance, pct_covered


def disc(lon, lat, r_m):
    """Geodesic-ish disc polygon in lon/lat."""
    dlat = math.degrees(r_m / 6_371_008.8)
    dlon = dlat / math.cos(math.radians(lat))
    ang = np.linspace(0, 2 * math.pi, 256)
    from shapely.geometry import Polygon
    return Polygon(zip(lon + dlon * np.cos(ang), lat + dlat * np.sin(ang), strict=True))


def borings(points, **kw):
    n = len(points)
    base = dict(tier=[2] * n, boring_type=["SPT"] * n, source_id=["s"] * n,
                kind=["geotechnical"] * n, year=[2010] * n, report_key=[None] * n)
    base.update(kw)
    return pd.DataFrame({"lon": [p[0] for p in points], "lat": [p[1] for p in points], **base})


@pytest.mark.parametrize("R", [500, 1000, 1500])
def test_single_boring_at_disc_center(R):
    r = 2000
    lon, lat = -82.33, 29.65
    grid = make_grid(disc(lon, lat, r), 10)
    d = nearest_distance(grid, borings([(lon, lat)]))
    assert pct_covered(d, grid.area_m2, R) == pytest.approx(100 * (R / r) ** 2, abs=3)


def test_no_borings_means_zero_and_one_big_gap():
    grid = make_grid(disc(-82.33, 29.65, 1500), 10)
    d = nearest_distance(grid, borings([]))
    assert pct_covered(d, grid.area_m2, 1000) == 0
    gaps = find_gaps(grid, d, 500)
    assert len(gaps) == 1 and gaps[0]["n_cells"] == len(grid.cells)


def test_gaps_ranked_by_area():
    lon, lat = -82.33, 29.65
    grid = make_grid(disc(lon, lat, 3000), 10)
    d = nearest_distance(grid, borings([(lon, lat)]))
    gaps = find_gaps(grid, d, 500)
    assert len(gaps) == 1  # annulus around the covered center is one connected cluster
    expected = math.pi * (3.0**2 - 0.5**2)
    assert gaps[0]["area_km2"] == pytest.approx(expected, rel=0.05)
    assert Point(gaps[0]["centroid_lon"], gaps[0]["centroid_lat"]).distance(
        Point(lon, lat)) < 0.005


def test_filters_cumulative_tier_and_recency():
    df = borings([(0, 0)] * 4, tier=[1, 2, 3, 4], year=[1990, 2001, None, 2016],
                 boring_type=["SPT", "CPT", "Auger", "Well"],
                 kind=["geotechnical"] * 3 + ["geologic_well"])
    assert Filters(max_tier=2).mask(df).tolist() == [True, True, False, False]
    assert Filters(max_tier=4).mask(df).tolist() == [True, True, True, True]
    assert Filters(min_year=2000, include_undated=False).mask(df).tolist() == \
        [False, True, False, True]
    assert Filters(min_year=2000).mask(df).tolist() == [False, True, True, True]
    assert Filters(types=("SPT", "CPT")).mask(df).sum() == 2
    assert Filters().mask(df).sum() == 4
    assert Filters(exclude_kinds=("geologic_well",)).mask(df).sum() == 3
