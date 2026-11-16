import h3
import pytest

from pipeline.areas import build_areas, pseudo_points
from pipeline.coverage import make_grid, nearest_distance, pct_covered


def _sq(x0, y0, d):
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d],
                                                [x0, y0 + d], [x0, y0]]]}


def _rec(pid, geom, status="Issued", ts=0):
    return {"attrs": {"OFFCL_PRMT_ID": pid, "PRMT_PROJ_NM": f"P{pid}", "PRMT_STTS": status,
                      "PRMT_DECISION_DT": ts, "RECV_DT": 1730764800000, "LINK": "https://x"},
            "geometry": geom}


def test_build_areas_groups_excludes_and_limits(sources):
    src = sources["sjrwmd_erp"]
    recs = [_rec(1, _sq(-82.34, 29.65, 0.002), ts=1), _rec(1, _sq(-82.339, 29.65, 0.002), ts=2),
            _rec(2, _sq(-82.30, 29.65, 0.002), status="Never Issued"),
            _rec(3, _sq(-82.40, 29.60, 0.05))]  # ~1,250 acres: drawn, not counted
    a = build_areas(recs, src, 11).set_index("area_uid")
    assert list(a.index) == ["sjrwmd_erp:1", "sjrwmd_erp:3"]
    one = a.loc["sjrwmd_erp:1"]
    assert one.n_records == 2 and one.counts_toward_coverage and one.cells
    assert '"Received": "2024-11-05"' in one.details
    assert not a.loc["sjrwmd_erp:3"].counts_toward_coverage and a.loc["sjrwmd_erp:3"].cells == ""


def test_area_cells_are_distance_zero(sources):
    src = sources["sjrwmd_erp"]
    a = build_areas([_rec(1, _sq(-82.34, 29.65, 0.004))], src, 10)
    pts = pseudo_points(a, 10)
    from shapely.geometry import shape
    grid = make_grid(shape(_sq(-82.345, 29.645, 0.014)), 10)
    d = nearest_distance(grid, pts)
    inside = set(h3.uncompact_cells(a.cells.iloc[0].split(","), 10))
    for c, dist in zip(grid.cells, d, strict=True):
        if c in inside:
            assert dist == pytest.approx(0, abs=1e-6)
    assert 0 < pct_covered(d, grid.area_m2, 0.1) < 100
