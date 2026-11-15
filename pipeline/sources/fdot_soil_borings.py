"""FDOT soil borings use the generic ArcGIS adapter; this module documents the extra
district layers so expanding coverage is a config change (add entries to sources.yaml).

Same folder (Soil_Boring): D1_D7_Soil_Boring_viewer, D2_Soil_Boring_viewer,
D3_Soil_Boring_viewer, D5_Soil_Boring_viewer. TPIKE_Soil_Boring_viewer is tagged "test": ignore.
"""
BASE = "https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/{name}/MapServer/0"
DISTRICT_LAYERS = {
    "D1_D7": BASE.format(name="D1_D7_Soil_Boring_viewer"),
    "D2": BASE.format(name="D2_Soil_Boring_viewer"),
    "D3": BASE.format(name="D3_Soil_Boring_viewer"),
    "D5": BASE.format(name="D5_Soil_Boring_viewer"),
}
