from pathlib import Path

from pipeline.normalize import normalize_source
from pipeline.sources.usgs_nwis import parse_rdb

FIX = Path(__file__).parent / "fixtures"


def test_parse_rdb_and_normalize(sources):
    rows = parse_rdb((FIX / "usgs_nwis_sample.rdb").read_text())
    assert len(rows) == 3 and rows[0]["site_no"] == "293634082144901"
    recs = [{"attrs": {**r, "page_url": "u", "depth_ft": r["well_depth_va"]},
             "lon": float(r["dec_long_va"]), "lat": float(r["dec_lat_va"])} for r in rows]
    df = normalize_source(recs, sources["usgs_nwis_gw"])
    row = df.iloc[0]
    assert row.tier == 1 and row.kind == "geologic_well" and row.boring_type == "Well"
    assert row.depth_ft == 80.0 and row.year == 1968 and row.site_id == "usgs:293634082144901"
