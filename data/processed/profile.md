# Data profile: Gainesville, FL

Generated 2026-11-16T00:51:27+00:00.

## FDOT District 2 Soil Borings (`fdot_d2`)

**Not available:** failed — gis.fdot.gov refused the request (HTTP 403; looks like the host's own firewall/WAF, not the sandbox)

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

- Reports built: **157**; borings in reports: **157** (= sum of n_borings: 157); borings without a key: **0**.
- Reports spanning > 5 km (corridor project or bad key): **0**


