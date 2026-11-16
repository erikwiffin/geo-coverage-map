import json

from pipeline.sources.arcgis_points import fetch


def test_import_dir_esri_and_geojson(tmp_path):
    esri = {"spatialReference": {"wkid": 4326}, "features": [
        {"attributes": {"OBJECTID": 1, "TYPE": "SPT"}, "geometry": {"x": -82.3, "y": 29.6}},
        {"attributes": {"OBJECTID": 2, "TYPE": "CPT"}, "geometry": {"x": -90.0, "y": 29.6}}]}
    def pt(oid, x, y):
        return {"type": "Feature", "properties": {"OBJECTID": oid},
                "geometry": {"type": "Point", "coordinates": [x, y]}}
    gj = {"type": "FeatureCollection", "features": [pt(1, -82.3, 29.6), pt(3, -82.31, 29.61)]}
    (tmp_path / "page0.json").write_text(json.dumps(esri))
    (tmp_path / "page1.json").write_text(json.dumps(gj))
    (tmp_path / "layer.json").write_text("{}")
    src = {"id": "x", "import_dir": str(tmp_path), "field_map": {"native_id": "OBJECTID"}}
    recs = fetch(src, None, (-83, 29, -82, 30))
    assert sorted(r["attrs"]["OBJECTID"] for r in recs) == [1, 3]  # dedup + bbox filter


def test_attachments_index(tmp_path):
    page = {"spatialReference": {"wkid": 4326}, "features": [
        {"attributes": {"OBJECTID": 117}, "geometry": {"x": -82.3, "y": 29.6}},
        {"attributes": {"OBJECTID": 118}, "geometry": {"x": -82.3, "y": 29.6}}]}
    att = {"attachmentGroups": [{"parentObjectId": 117, "attachmentInfos": [
        {"id": 19584, "contentType": "application/pdf", "size": 84392, "name": "B-12.pdf"}]}]}
    (tmp_path / "page0.json").write_text(json.dumps(page))
    (tmp_path / "attachments.json").write_text(json.dumps(att))
    src = {"id": "x", "url": "https://h/MapServer/0", "import_dir": str(tmp_path),
           "field_map": {"native_id": "OBJECTID"}}
    recs = {r["attrs"]["OBJECTID"]: r for r in fetch(src, None, None)}
    assert recs[117]["attachments"][0]["url"] == "https://h/MapServer/0/117/attachments/19584"
    assert recs[118]["attachments"] == []
