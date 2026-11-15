from conftest import load_fixture

from pipeline.normalize import (
    dedupe_across_sources,
    normalize_source,
    normalize_type,
    parse_date,
    report_key,
)


def test_parse_date_formats():
    assert parse_date("03/14/2011") == ("2011-03-14", 2011, "%m/%d/%Y")
    assert parse_date("5/2/09") == ("2009-05-02", 2009, "%m/%d/%y")
    assert parse_date("2016-07-01T00:00:00") == ("2016-07-01", 2016, "%Y-%m-%d")
    assert parse_date("1998") == (None, 1998, "%Y")
    assert parse_date(1094601600000)[1] == 2004  # ArcGIS epoch ms
    assert parse_date("")[2] == "null"
    assert parse_date(None)[2] == "null"
    assert parse_date("unknown") == (None, None, "unparsed")


def test_normalize_type():
    assert normalize_type("SPT") == "SPT"
    assert normalize_type("CPT") == "CPT"
    assert normalize_type("Hand Auger") == "Auger"
    assert normalize_type(None) == "Other"
    assert normalize_type("Rock core") == "Other"


def test_report_key_first_non_null_wins():
    spec = ["DOC_ID", "DOC_LINK", ["FIN", "PROJNUM", "DOC_NAME"]]
    assert report_key({"DOC_ID": 501.0, "DOC_LINK": "u"}, spec) == "DOC_ID=501"
    assert report_key({"DOC_ID": None, "DOC_LINK": "u"}, spec) == "DOC_LINK=u"
    assert report_key({"FIN": "9", "DOC_NAME": "n"}, spec) == "FIN+PROJNUM+DOC_NAME=9||n"
    assert report_key({}, spec) is None


def test_normalize_fdot_synthetic(sources, area):
    df = normalize_source(load_fixture("fdot_synthetic.records.json"), sources["fdot_d2"],
                          area["county_bbox"])
    # zero-coordinate record dropped; exact duplicate (OBJECTID 8 == 1) collapsed
    assert "fdot_d2:7" not in set(df.boring_uid)
    assert "fdot_d2:8" not in set(df.boring_uid)
    assert len(df) == 7
    assert df.set_index("boring_uid").loc["fdot_d2:9", "flags"] == ["swapped_latlon"]
    row = df.set_index("boring_uid").loc["fdot_d2:1"]
    assert row.tier == 2 and row.kind == "geotechnical" and row.boring_type == "SPT"
    assert row.report_key == "fdot_d2:DOC_ID=501" and row.depth_ft is None
    assert row.elev == 152.3 and row.gw == 8.0


def test_normalize_fgs_recorded(sources, area):
    df = normalize_source(load_fixture("fgs_wells_sample.records.json"), sources["fgs_wells"],
                          area["county_bbox"])
    assert len(df) == 20
    assert set(df.boring_type) == {"Well"}
    assert df.kind.eq("geologic_well").all()
    assert df.depth_ft.notna().any()
    assert df.lon.between(-83, -82).all() and df.lat.between(29, 30).all()


def test_cross_source_dedupe_keeps_lowest_tier(sources, area):
    import pandas as pd
    a = normalize_source(load_fixture("fdot_synthetic.records.json"), sources["fdot_d2"],
                         area["county_bbox"])
    b = a.head(1).copy()
    b["source_id"], b["tier"], b["boring_uid"] = "other", 4, "other:1"
    b["lon"] = b["lon"] + 0.00002  # ~2 m east
    out = dedupe_across_sources(pd.concat([b, a]), 5, ["fdot_d2", "other"])
    assert "other:1" not in set(out.boring_uid)
    assert out.set_index("boring_uid").loc["fdot_d2:1", "also_in"] == ["other:1"]
    # incompatible types are not merged
    b["boring_type"] = "CPT"
    out = dedupe_across_sources(pd.concat([b, a]), 5, ["fdot_d2", "other"])
    assert "other:1" in set(out.boring_uid)
