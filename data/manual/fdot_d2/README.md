# FDOT D2 soil borings: browser-saved query pages

`gis.fdot.gov` returns 403 to scripts (Azure WAF) but works in a browser. Open each URL below,
save the response as `page0.json`, `page1.json`, ... in this folder, and run
`python -m pipeline all`. Keep opening pages until one has fewer than 1000 features. The first
URL returns the total count.

Envelope = Gainesville boundary bbox + 1 km (from `data/raw/fetch_manifest.json`).

- Count: https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soil_Boring_viewer/MapServer/0/query?geometry=-82.44114%2C29.57772%2C-82.21204%2C29.78734&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&where=1%3D1&returnCountOnly=true&f=json
- page0: https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soil_Boring_viewer/MapServer/0/query?geometry=-82.44114%2C29.57772%2C-82.21204%2C29.78734&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&where=1%3D1&outFields=%2A&outSR=4326&orderByFields=OBJECTID&resultOffset=0&resultRecordCount=1000&f=json
- page1: same URL with `resultOffset=1000`
- page2: same URL with `resultOffset=2000`, and so on

`layer.json` is the layer metadata (`?f=pjson`, saved 2026-11-15; renderer images stripped).
