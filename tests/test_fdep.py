import json

import pandas as pd

from pipeline.normalize import dedupe_across_sources, normalize_source


def _pet(oid, fac, lon, date):
    return {"attrs": {"OBJECTID": oid, "FACILITY_ID": fac, "FACILITY_NAME": "STATION",
                      "DISCHARGE_DATE": date, "ADDRESS": "1 MAIN ST",
                      "GENERAL_CLEANUP_STATUS": "CLOSURE",
                      "DOCUMENT_LINK": f"https://prodenv.dep.state.fl.us/x/{fac}"},
            "lon": lon, "lat": 29.65}


def test_petroleum_discharges_collapse_to_facility(sources):
    recs = [_pet(1, 8500032, -82.30, 900000000000), _pet(2, 8500032, -82.30, 562550400000),
            _pet(3, 8500035, -82.31, None)]
    df = normalize_source(recs, sources["fdep_petroleum"])
    assert sorted(df.site_id) == ["8500032", "8500035"]
    kept = df.set_index("site_id").loc["8500032"]
    assert kept.year == 1987  # earliest discharge kept
    assert kept.kind == "environmental_site" and kept.boring_type == "Site"
    assert json.loads(kept.details)["Cleanup status"] == "CLOSURE"


def test_same_facility_in_two_layers_merges_even_when_far_apart(sources):
    pet = normalize_source([_pet(1, 9401874, -82.300, None)], sources["fdep_petroleum"])
    cln = normalize_source([{"attrs": {"OBJECTID": 7, "SOURCE_DATABASE_ID": "9401874",
                                       "BUSINESS_NAME": "STATION"},
                             "lon": -82.301, "lat": 29.65}], sources["fdep_cleanup"])  # ~97 m
    out = dedupe_across_sources(pd.concat([pet, cln]), 5, ["fdep_cleanup", "fdep_petroleum"])
    assert list(out.source_id) == ["fdep_cleanup"]
    assert out.also_in.iloc[0] == ["fdep_petroleum:1"]


def test_colocated_wells_kept_and_flagged(sources):
    def w(stn, lon, method=None):
        return {"attrs": {"STN_ID": stn, "STN_NM": "1", "WELL_DEPTH": 28.0,
                          "MTHD_DTRMN_DSC": method}, "lon": lon, "lat": 29.66}
    df = normalize_source([w(1, -82.30), w(2, -82.30), w(3, -82.31, "STR Centroid"),
                           w(4, -82.32, "GPS")], sources["sjrwmd_wells"])
    flags = df.set_index("boring_uid")["flags"].to_dict()
    assert len(df) == 4
    assert flags["sjrwmd_wells:1"] == ["approx_location"]  # shares a coordinate
    assert flags["sjrwmd_wells:3"] == ["approx_location"]  # STR centroid
    assert flags["sjrwmd_wells:4"] == []
