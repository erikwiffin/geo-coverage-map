import shutil
from pathlib import Path

import pandas as pd

from pipeline.normalize import dedupe_across_sources, normalize_source
from pipeline.sources.diggs import fetch

FIX = Path(__file__).parent / "fixtures"


def test_diggs_parse_and_disclaimer(tmp_path, sources):
    shutil.copy(FIX / "diggs_synthetic.html", tmp_path / "a.html")
    shutil.copy(FIX / "diggs_synthetic.html", tmp_path / "b.html")  # overlapping export
    src = dict(sources["geosetta_diggs"], import_dir=str(tmp_path))
    recs = fetch(src, None, None)
    assert len(recs) == 2  # co-located boreholes kept apart; overlap read once
    b1 = next(r["attrs"] for r in recs if r["attrs"]["name"] == "B-1")
    assert b1["n_values"] == [[1.0, 2.5, 12.0], [18.5, 20.0, 30.0]]
    assert b1["lithology"] == [[0.0, 20.0, "SP", "BROWN FINE SAND (SP)"]]  # 'Bottom' dropped
    assert b1["depth_ft"] == 20.0 and b1["test_type"] == "SPT" and b1["provider"] == "FDOT"
    b2 = next(r["attrs"] for r in recs if r["attrs"]["name"] == "B-2")
    assert b2["depth_ft"] == 30.0 and b2["test_type"] is None
    assert b1["flags"] == ["approx_location"]  # two boreholes on one exact coordinate
    assert "Synthetic test disclaimer" in (tmp_path / "DISCLAIMER.txt").read_text()

    df = normalize_source(recs, src)
    assert len(df) == 2 and df.tier.eq(4).all() and df.log.notna().all()
    assert set(df.boring_type) == {"SPT", "Other"}


def test_geosetta_enriches_matching_lower_tier_boring(tmp_path, sources):
    shutil.copy(FIX / "diggs_synthetic.html", tmp_path / "a.html")
    src = dict(sources["geosetta_diggs"], import_dir=str(tmp_path))
    g = normalize_source(fetch(src, None, None), src)
    fdot = normalize_source([{"attrs": {"OBJECTID": 9, "TYPE": "SPT", "FIN": "1"},
                              "lon": -82.34001, "lat": 29.65}], sources["fdot_d2"])  # ~1 m
    out = dedupe_across_sources(pd.concat([g, fdot]), 5,
                                ["fdot_d2", "fgs_wells", "geosetta_diggs"])
    kept = out.set_index("boring_uid").loc["fdot_d2:9"]
    assert kept.depth_ft == 20.0 and kept.log_from == "geosetta_diggs"
    assert len(kept.also_in) == 2  # both co-located Geosetta boreholes ("Other" is compatible)
    assert (out.source_id == "geosetta_diggs").sum() == 0
