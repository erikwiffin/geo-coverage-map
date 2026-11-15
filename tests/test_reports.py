from conftest import load_fixture

from pipeline.normalize import normalize_source
from pipeline.reports import build_reports


def test_reports_membership_and_footprints(sources, area):
    df = normalize_source(load_fixture("fdot_synthetic.records.json"), sources["fdot_d2"],
                          area["county_bbox"])
    rep = build_reports(df, buffer_m=30, span_flag_km=5)
    assert rep["n_borings"].sum() == df["report_key"].notna().sum()
    r = rep.set_index("report_key").loc["fdot_d2:DOC_ID=501"]
    assert r.n_borings == 3 and r.hull is not None and r.types == ["CPT", "SPT"]
    assert r.date_min == "2011-03-14" and r.date_max == "2016-07-01"
    # three 30 m buffers ~100 m apart: area > one buffer, < three disjoint buffers
    import math
    a = rep.to_crs(rep.estimate_utm_crs()).set_index("report_key").loc[
        "fdot_d2:DOC_ID=501"].geometry.area
    assert math.pi * 30**2 < a <= 3 * math.pi * 30**2 * 1.01
    # FIN+PROJNUM+DOC_NAME report: two borings ~6.7 km apart -> flagged
    fin = rep.set_index("report_key").loc["fdot_d2:FIN+PROJNUM+DOC_NAME=999||I-75 widening"]
    assert fin.n_borings == 2 and fin.flag_span and fin.hull is None
