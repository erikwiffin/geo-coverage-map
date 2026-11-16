# Data profile: Gainesville, FL

Generated 2026-11-16T01:00:26+00:00.

## FDOT District 2 Soil Borings (`fdot_d2`)

- URL: https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soil_Boring_viewer/MapServer/0
- Tier 2, kind `geotechnical`
- Raw records in envelope: **412**; after cleaning: **412**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| ELEV | 56.8 |
| GR_WTR | 100.0 |
| LAT | 0.0 |
| LON | 0.0 |
| OBJECTID | 0.0 |
| BORENUM | 0.0 |
| BOREDATE | 81.3 |
| FIN | 0.2 |
| PROJNUM | 100.0 |
| ITEM | 100.0 |
| ITEMSEG | 100.0 |
| PHASE | 100.0 |
| PROJDESC | 100.0 |
| TYPE | 0.0 |
| DOC_LINK | 0.0 |
| PERCOLATION | 100.0 |
| STATION | 0.0 |
| OFFSET | 1.2 |
| REF_RAMP | 50.0 |
| DISTRICT | 50.0 |
| COUNTY | 50.0 |
| PSEE | 100.0 |
| SHEET | 50.0 |
| NOTES | 50.0 |
| DOC_ID | 100.0 |
| CONSULTANT | 50.0 |
| USER_NAME | 89.3 |
| DOC_NAME | 100.0 |

### `TYPE` distribution

| TYPE | n |
|---|---|
| SPT | 271 |
| Auger | 141 |

### Normalized boring_type

| type | n |
|---|---|
| SPT | 271 |
| Auger | 141 |

### Date formats (field `BOREDATE`)

Share with a parsed year: **18.7%**; undated: **335**.

| format | n |
|---|---|
| null | 335 |
| %m/%d/%Y | 77 |

Year range: 2018–2025, median 2022.

### Report-key candidates

Normalized before keying: {'FIN': 'digits'}.

| key | non_null_pct | distinct | values_with_>1 FIN | values_with_>1 DOC_LINK | values_with_>1 DOC_ID |
|---|---|---|---|---|---|
| DOC_ID | 0.0 | 0 | 0.0 | 0.0 |  |
| FIN | 99.8 | 21 |  | 15.0 | 0.0 |
| DOC_LINK | 100.0 | 71 | 0.0 |  | 0.0 |

### Hostnames in `DOC_LINK`

| host | n |
|---|---|
| dotsd2ww01.dot.state.fl.us | 271 |
| UNC share \\dotad2cohesity | 141 |

Examples: <http://dotsd2ww01.dot.state.fl.us/intranet/highway-operations/materials/MR/20778515201/B-12.pdf>, <http://dotsd2ww01.dot.state.fl.us/intranet/highway-operations/materials/MR/20754525201/1.pdf>, <http://dotsd2ww01.dot.state.fl.us/intranet/highway-operations/materials/MR/20754525201/2.pdf>, <http://dotsd2ww01.dot.state.fl.us/intranet/highway-operations/materials/MR/20754525201/3.pdf>, <http://dotsd2ww01.dot.state.fl.us/intranet/highway-operations/materials/MR/20784985201/B-1.pdf>

### Layer attachments

```
{
 "hasAttachments": true,
 "sample": "not probed (host blocks scripted clients)"
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fdot_d2:117 | SPT | B-2 |  |  |  | fdot_d2:FIN=20778515201 |  | -82.325314 | 29.644461 |
| fdot_d2:118 | SPT | B-4 |  |  |  | fdot_d2:FIN=20778515201 |  | -82.323934 | 29.644836 |
| fdot_d2:119 | SPT | B-5 |  |  |  | fdot_d2:FIN=20778515201 |  | -82.32382 | 29.644874 |
| fdot_d2:120 | SPT | B-8 |  |  |  | fdot_d2:FIN=20778515201 |  | -82.324612 | 29.644624 |
| fdot_d2:148 | SPT | B-1 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.422604 | 29.688867 |
| fdot_d2:149 | SPT | B-2 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.422919 | 29.688868 |
| fdot_d2:150 | SPT | B-3 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.423187 | 29.688868 |
| fdot_d2:151 | SPT | B-4 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.423455 | 29.68887 |
| fdot_d2:152 | SPT | B-5 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.423678 | 29.688873 |
| fdot_d2:153 | SPT | B-6 |  |  |  | fdot_d2:FIN=20754525201 |  | -82.42399 | 29.688874 |


## Florida Geological Survey Wells (`fgs_wells`)

- URL: https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/FGS_WELLS/MapServer/0
- Tier 2, kind `geologic_well`
- Raw records in envelope: **157**; after cleaning: **157**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| OBJECTID | 0.0 |
| WELL_NAME | 0.0 |
| PROGRAM_AREA | 99.4 |
| COUNTY | 0.0 |
| SECTION | 0.6 |
| QUARTERS | 15.9 |
| TOTAL_DEPTH | 1.9 |
| VERIFICATION_METHOD | 26.8 |
| LOCATION_SOURCE | 28.7 |
| DRILL_DATE | 17.8 |
| DRILL_YEAR | 8.3 |
| PERMIT_NUMBER | 92.4 |
| IS_OFFSHORE | 0.0 |
| COMMENTS | 63.1 |
| API_NUMBER | 100.0 |
| BOREHOLE_NUMBER | 0.0 |
| LATITUDE_DECIMAL_DEGREES | 0.0 |
| LONGITUDE_DECIMAL_DEGREES | 0.0 |
| STATE | 0.0 |
| COUNTRY | 0.0 |
| BOREHOLE_ADDRESS | 45.2 |
| BOREHOLE_TOWNSHIP | 0.6 |
| TOWNSHIP_DIR | 0.6 |
| BOREHOLE_RANGE | 0.6 |
| RANGE_DIR | 0.6 |
| WATER_MANAGEMENT_DISTRICT | 3.2 |
| BOREHOLE_TYPE | 11.5 |
| BOREHOLE_USAGE | 5.7 |
| DOCUMENTED_ELEVATION | 4.5 |
| ELEVATION_REFERENCE_POINT | 15.9 |
| DEM_ELEVATION | 5.7 |
| DEM_REFERENCE_SOURCE | 98.7 |
| VERTICAL_DATUM | 1.3 |
| VERTICAL_ACQUISITION_METHOD | 0.0 |
| HORIZONTAL_DATUM | 0.0 |
| HORIZONTAL_ACQUISITION_METHOD | 0.0 |
| ACCURACY | 26.8 |
| STATE_ID | 100.0 |
| WMD_ID | 89.2 |
| USGS_ID | 93.6 |
| ALTERNATE_DESIGNATION | 100.0 |
| WACS_FACILITY_ID | 100.0 |
| UIC_ID | 100.0 |
| UIC_MONITOR_WELL_ID | 100.0 |
| OWNER_NAME | 0.0 |
| DRILLER_NAME | 58.0 |
| DRILL_COMPANY | 40.1 |
| DRILLED_BY_FGS | 0.0 |
| LOCATION_VERIFICATION_NOTE | 28.0 |
| FGS_LITHOLOG_AVAIL | 0.0 |
| DRILLERS_LOG_AVAIL | 0.0 |
| HYDROGEOLOGIST_LOG_AVAIL | 0.0 |
| FIELD_LITHOLOGY_AVAIL | 0.0 |
| PALOE_LOG_AVAIL | 0.0 |
| DATA_CONFIDENTIAL_EXPIR_DATE | 100.0 |
| DATA_CONFIDENTIAL_INDICATOR | 0.0 |
| INTERNAL_ID | 0.0 |
| REPORT_LINK | 0.0 |

### Normalized boring_type

| type | n |
|---|---|
| Well | 157 |

### Date formats (field `DRILL_DATE`)

Share with a parsed year: **92.4%**; undated: **12**.

| format | n |
|---|---|
| epoch_ms | 129 |
| year_field | 16 |
| null | 12 |

Year range: 1930–2016, median 1960.

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| REPORT_LINK | 100.0 | 157 |

### Hostnames in `REPORT_LINK`

| host | n |
|---|---|
| geodes.kyrasolutions.com | 157 |

Examples: <https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWell/18576>, <https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWell/18577>, <https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWell/18578>, <https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWell/18579>, <https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWell/14713>

### Layer attachments

```
{
 "hasAttachments": false
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fgs_wells:47 | Well | GRU - North Main Street (A-0392) | 1094601600000 | 2004.0 | 192.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.319725 | 29.691673 |
| fgs_wells:48 | Well | GRU - F2 (A-0399) | 1096502400000 | 2004.0 | 165.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.315559 | 29.748339 |
| fgs_wells:49 | Well | GRU - F3 (A-0396) | 1097020800000 | 2004.0 | 130.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.31417 | 29.728339 |
| fgs_wells:50 | Well | GRU - F6 (A-0402) | 1097539200000 | 2004.0 | 120.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.339447 | 29.72945 |
| fgs_wells:258 | Well | Dept. of Interior- Natl. Fish & Wildlife | 322790400000 | 1980.0 | 310.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.418563 | 29.725186 |
| fgs_wells:1006 | Well | Northwood Well #2 | -141940800000 | 1965.0 | 330.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.358333 | 29.695836 |
| fgs_wells:1033 | Well | UF - Old Union Bldg 8" Recharge Well | -72489600000 | 1967.0 | 427.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.347625 | 29.662784 |
| fgs_wells:1103 | Well | Gainesville- Lake Kanapaha WWTP | 203817600000 | 1976.0 | 1050.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.412264 | 29.63195 |
| fgs_wells:1721 | Well | Koppers XB-1 |  | 2002.0 | 155.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.3281 | 29.680914 |
| fgs_wells:1986 | Well | City of Gainesville 1954 (Airport) |  | 1954.0 | 350.0 | fgs_wells:REPORT_LINK=https://geodes.kyrasolutions.com/Boreh | https://geodes.kyrasolutions.com/BoreholeSummary/InventoryWe | -82.274163 | 29.695836 |


## Reports (M2)

- Reports built: **179**; borings in reports: **569** (= sum of n_borings: 569); borings without a key: **0**.
- Reports spanning > 5 km (corridor project or bad key): **1**

  - `fdot_d2:FIN=44703215201` — 26 borings, 5042 m
