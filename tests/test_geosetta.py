"""Geosetta API adapter and model-grid summaries (offline, with a fake client)."""
import json
import math

import pandas as pd

from pipeline.coverage import Filters
from pipeline.geosetta_api import GeosettaClient, NotCached
from pipeline.model_grid import summarize_prediction, summarize_site_class
from pipeline.normalize import normalize_source
from pipeline.sources import geosetta

DIGGS = """<Diggs xmlns="http://diggsml.org/schemas/3" xmlns:gml="http://www.opengis.net/gml/3.2"
 xmlns:xlink="http://www.w3.org/1999/xlink">
 <project><Project gml:id="P0"><gml:name>Test Project</gml:name></Project></project>
 <samplingFeature><Borehole gml:id="B0"><gml:name>B-1</gml:name><projectRef xlink:href="#P0"/>
  <referencePoint><PointLocation><gml:pos>29.6 -82.3 150</gml:pos></PointLocation></referencePoint>
  <totalMeasuredDepth>30</totalMeasuredDepth></Borehole></samplingFeature>
</Diggs>"""


def test_circle_grid_covers_bbox():
    bbox = (-82.44, 29.57, -82.21, 29.79)
    centres = geosetta.circle_grid(bbox, 5000)
    # every point of the bbox lies within 5 km of some centre
    for i in range(21):
        for j in range(21):
            lon = bbox[0] + (bbox[2] - bbox[0]) * j / 20
            lat = bbox[1] + (bbox[3] - bbox[1]) * i / 20
            d = min(math.hypot((lat - a) * 111_320,
                               (lon - b) * 111_320 * math.cos(math.radians(lat)))
                    for a, b in centres)
            assert d <= 5000


class FakeClient:
    calls = cache_hits = 0

    def __init__(self, radius):
        self.radius = radius

    def deliverable(self, deliverable_type, data, **kw):
        return {"status": 200, "body": {"results": {"points_in_radius": {
            "features": [{"properties": p} for p in self.radius]}}}}

    def request(self, method, path, **kw):
        if "/tiles/" in path:
            return {"status": 200, "body": ""}
        if "diggs_xml" in path:
            return {"status": 200, "body": DIGGS if "29.6%3B-82.3" in path else "<Diggs/>"}
        if "do_files_json" in path:
            return {"status": 200, "body": {"files": [{"path": "logs/reports/doc.pdf"}]}}
        raise AssertionError(path)


def test_collect_labels_documents_and_parsed_logs():
    radius = [
        {"functionalkey": "29.6;-82.3", "source": "FDOT", "latitude": 29.6, "longitude": -82.3,
         "total_depth_ft": 30.0, "elevation_ft": 150},
        {"functionalkey": "29.65;-82.35", "source": "Automated Web Crawl", "latitude": 29.65,
         "longitude": -82.35, "total_depth_ft": None, "elevation_ft": None},
    ]
    catalog = {"logs/reports/doc.pdf": {"title": "A paper", "kind": "journal article",
                                        "site_specific": False, "rights": "Copyrighted"}}
    recs, extra = geosetta.collect(FakeClient(radius), (-83, 29, -82, 30), catalog)
    by = {r["attrs"]["uid"]: r["attrs"] for r in recs}
    fdot, doc = by["29.6;-82.3"], by["29.65;-82.35"]
    assert fdot["test_type"] is None and fdot["log"]["via"] == "Geosetta API (DIGGS)"
    assert fdot["project"] == "Test Project" and fdot["doc_path"] is None
    assert doc["test_type"] == "Document" and doc["doc_title"] == "A paper"
    assert doc["rights"] == "Copyrighted" and "not_site_data" in doc["flags"]
    assert extra["documents"] == {"logs/reports/doc.pdf": "A paper"}

    src = {"id": "geosetta", "adapter": "geosetta", "tier": 4, "kind": "geotechnical",
           "rights": "Geosetta terms", "keep_colocated": True,
           "field_map": {"native_id": "uid", "type": "test_type", "doc_name": "doc_title"},
           "report_key": ["doc_path", "report_group", "project"]}
    df = normalize_source(recs, src)
    row = df.set_index("boring_uid").loc["geosetta:29.65;-82.35"]
    assert row["boring_type"] == "Document" and row["rights"] == "Copyrighted"
    assert row["report_key"] == "geosetta:doc_path=logs/reports/doc.pdf"
    assert df.set_index("boring_uid").loc["geosetta:29.6;-82.3", "rights"] == "Geosetta terms"
    # not_site_data records never count toward coverage
    assert Filters().mask(df).tolist() == [True, False]


def test_no_coverage_flag_from_geojson_strings():
    df = pd.DataFrame({"tier": [4, 4], "flags": ["approx_location,not_site_data", None]})
    assert Filters().mask(df).tolist() == [False, True]


def test_summarize_prediction():
    prof = [{"depth_ft": d, "soil_description": "Loose SAND" if d < 3 else "Stiff CLAY",
             "USCS_groupSymbol": "SP" if d < 3 else "CL",
             "dominant_grain_size": "SAND" if d < 3 else "CLAY",
             "dominant_N_value": "1-9" if d < 5 else "10-25", "geomaterial": "SAND"}
            for d in range(0, 8)]
    s = summarize_prediction({"profiles": prof, "groundwater": {"depth_category": 1},
                              "confidence": {"average": 60, "boring_stats": {"count_500m": 3}},
                              "point": {"minimum_distance_from_trained_point_(mi)": 0.5}})
    assert s["layers"] == [[0, 2, "SP", "Loose SAND", "1-9"], [3, 7, "CL", "Stiff CLAY", "10-25"]]
    assert (s["depth_fines_ft"], s["depth_n10_ft"], s["depth_rock_ft"]) == (3, 5, None)
    assert s["gw_category"] == 1 and s["confidence"] == 60 and s["borings_500m"] == 3


def test_summarize_site_class_range():
    s = summarize_site_class({"status": "success",
                              "site_class": {"lower_bound": "DE", "upper_bound": "D"},
                              "vs30_ft_s": {"average": 741.8}})
    assert s["site_class"] == "D–DE" and s["vs30_ft_s"] == 741.8
    assert summarize_site_class({"status": "error"}) == {}


def test_client_offline_cache(tmp_path):
    c = GeosettaClient(tmp_path, key="k", offline=True)
    try:
        c.request("GET", "/x", kind="t")
        raise AssertionError("expected NotCached")
    except NotCached:
        pass
    cp = c._cache_path("t", "GET", "https://geosetta.org/x", None)
    cp.parent.mkdir(parents=True)
    cp.write_text(json.dumps({"status": 200, "body": {"ok": 1}}))
    assert c.request("GET", "/x", kind="t")["body"] == {"ok": 1}
