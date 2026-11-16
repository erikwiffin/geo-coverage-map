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
    # outline = concave hull padded 30 m: covers every boring's 30 m circle, and is no bigger
    # than the padded convex hull
    import geopandas as gpd
    from shapely.geometry import MultiPoint
    utm = rep.estimate_utm_crs()
    foot = rep.to_crs(utm).set_index("report_key").loc["fdot_d2:DOC_ID=501"].geometry
    pts = gpd.GeoSeries(gpd.points_from_xy(df.lon, df.lat), crs=4326).to_crs(utm)[
        (df.report_key == "fdot_d2:DOC_ID=501").to_numpy()]
    assert foot.buffer(0.5).contains(pts.buffer(29.5).union_all())
    assert foot.area <= MultiPoint(list(pts)).convex_hull.buffer(30, quad_segs=8).area * 1.001
    # FIN-keyed report: two borings ~6.7 km apart -> flagged
    fin = rep.set_index("report_key").loc["fdot_d2:FIN=999"]
    assert fin.n_borings == 2 and fin.flag_span and fin.hull is None
