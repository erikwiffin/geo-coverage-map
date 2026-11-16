# Data profile: Gainesville, FL

Generated 2026-11-16T02:10:09+00:00.

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
 "features_with_attachments": 412
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fdot_d2:117 | SPT | B-2 |  |  |  | fdot_d2:FIN=20778515201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.325314 | 29.644461 |
| fdot_d2:118 | SPT | B-4 |  |  |  | fdot_d2:FIN=20778515201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.323934 | 29.644836 |
| fdot_d2:119 | SPT | B-5 |  |  |  | fdot_d2:FIN=20778515201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.32382 | 29.644874 |
| fdot_d2:120 | SPT | B-8 |  |  |  | fdot_d2:FIN=20778515201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.324612 | 29.644624 |
| fdot_d2:148 | SPT | B-1 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.422604 | 29.688867 |
| fdot_d2:149 | SPT | B-2 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.422919 | 29.688868 |
| fdot_d2:150 | SPT | B-3 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.423187 | 29.688868 |
| fdot_d2:151 | SPT | B-4 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.423455 | 29.68887 |
| fdot_d2:152 | SPT | B-5 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.423678 | 29.688873 |
| fdot_d2:153 | SPT | B-6 |  |  |  | fdot_d2:FIN=20754525201 | https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soi | -82.42399 | 29.688874 |


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


## USGS NWIS Groundwater Sites (`usgs_nwis_gw`)

- URL: https://waterservices.usgs.gov/nwis/site/
- Tier 1, kind `geologic_well`
- Raw records in envelope: **28**; after cleaning: **28**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| agency_cd | 0.0 |
| site_no | 0.0 |
| station_nm | 0.0 |
| site_tp_cd | 0.0 |
| lat_va | 0.0 |
| long_va | 0.0 |
| dec_lat_va | 0.0 |
| dec_long_va | 0.0 |
| coord_meth_cd | 0.0 |
| coord_acy_cd | 0.0 |
| coord_datum_cd | 0.0 |
| dec_coord_datum_cd | 0.0 |
| district_cd | 0.0 |
| state_cd | 0.0 |
| county_cd | 0.0 |
| country_cd | 0.0 |
| land_net_ds | 82.1 |
| map_nm | 25.0 |
| map_scale_fc | 28.6 |
| alt_va | 10.7 |
| alt_meth_cd | 10.7 |
| alt_acy_va | 10.7 |
| alt_datum_cd | 10.7 |
| huc_cd | 0.0 |
| basin_cd | 100.0 |
| topo_cd | 82.1 |
| instruments_cd | 0.0 |
| construction_dt | 46.4 |
| inventory_dt | 100.0 |
| drain_area_va | 100.0 |
| contrib_drain_area_va | 100.0 |
| tz_cd | 0.0 |
| local_time_fg | 0.0 |
| reliability_cd | 0.0 |
| gw_file_cd | 10.7 |
| nat_aqfr_cd | 39.3 |
| aqfr_cd | 39.3 |
| aqfr_type_cd | 96.4 |
| well_depth_va | 17.9 |
| hole_depth_va | 85.7 |
| depth_src_cd | 85.7 |
| project_no | 92.9 |
| page_url | 0.0 |
| depth_ft | 17.9 |

### Normalized boring_type

| type | n |
|---|---|
| Well | 28 |

### Date formats (field `construction_dt`)

Share with a parsed year: **42.9%**; undated: **16**.

| format | n |
|---|---|
| null | 13 |
| %Y | 7 |
| %Y%m%d | 5 |
| unparsed | 3 |

Unparsed examples: `['198911', '199210', '199210']`

Year range: 1968–2004, median 1992.

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| site_no | 100.0 | 28 |

### Hostnames in `page_url`

| host | n |
|---|---|
| waterdata.usgs.gov | 28 |

Examples: <https://waterdata.usgs.gov/monitoring-location/293634082144901/>, <https://waterdata.usgs.gov/monitoring-location/293644082244201/>, <https://waterdata.usgs.gov/monitoring-location/293751082173501/>, <https://waterdata.usgs.gov/monitoring-location/293857082203985/>, <https://waterdata.usgs.gov/monitoring-location/294005082184901/>

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| usgs_nwis_gw:293634082144901 | Well | HOLBACK WELL NR G.VILLE | 19680101 | 1968.0 | 80.0 | usgs_nwis_gw:site_no=293634082144901 | https://waterdata.usgs.gov/monitoring-location/2936340821449 | -82.246768 | 29.609691 |
| usgs_nwis_gw:293644082244201 | Well | A-0016 RUN MONITOR WELL NO1 AT KANAPAHA |  |  | 250.0 | usgs_nwis_gw:site_no=293644082244201 | https://waterdata.usgs.gov/monitoring-location/2936440822442 | -82.411495 | 29.612468 |
| usgs_nwis_gw:293751082173501 | Well | FLA-BRA-1 |  |  | 3167.0 | usgs_nwis_gw:site_no=293751082173501 | https://waterdata.usgs.gov/monitoring-location/2937510821735 | -82.292925 | 29.630844 |
| usgs_nwis_gw:293857082203985 | Well | University of Florida |  |  | 406.0 | usgs_nwis_gw:site_no=293857082203985 | https://waterdata.usgs.gov/monitoring-location/2938570822039 | -82.343994 | 29.649412 |
| usgs_nwis_gw:294005082184901 | Well | McGurn Investments (HRS,G-06) UFA Well |  |  |  | usgs_nwis_gw:site_no=294005082184901 | https://waterdata.usgs.gov/monitoring-location/2940050821849 | -82.313556 | 29.668139 |
| usgs_nwis_gw:294011082260401 | Well | A-0713 ALACHUA CO VISA 3 AT GAINESVILLE,FL |  |  | 80.0 | usgs_nwis_gw:site_no=294011082260401 | https://waterdata.usgs.gov/monitoring-location/2940110822604 | -82.434275 | 29.669967 |
| usgs_nwis_gw:294028082245301 | Well | A-0712 VISA 2 NR GAINESVILLE,FL | 198911 |  | 80.0 | usgs_nwis_gw:site_no=294028082245301 | https://waterdata.usgs.gov/monitoring-location/2940280822453 | -82.414552 | 29.674689 |
| usgs_nwis_gw:294104082171202 | Well | A-0702 SURF WELL ALACHUA CO FAIR NR GAINESVILLE,FL | 19950831 | 1995.0 | 22.0 | usgs_nwis_gw:site_no=294104082171202 | https://waterdata.usgs.gov/monitoring-location/2941040821712 | -82.286492 | 29.68469 |
| usgs_nwis_gw:294105082171501 | Well | A-063 ALACHUA FAIRGROUNDS CF IN GAINESVILLE,FL | 19950301 | 1995.0 | 440.0 | usgs_nwis_gw:site_no=294105082171501 | https://waterdata.usgs.gov/monitoring-location/2941050821715 | -82.287326 | 29.684968 |
| usgs_nwis_gw:294106082171501 | Well | A-0366 L FLORIDAN ALACHUA CO FAIR NR GAINSVILLE,FL | 20040812 | 2004.0 | 1810.0 | usgs_nwis_gw:site_no=294106082171501 | https://waterdata.usgs.gov/monitoring-location/2941060821715 | -82.287326 | 29.685245 |


## Geosetta (DIGGS area exports) (`geosetta_diggs`)

- URL: None
- Tier 4, kind `geotechnical`
- Raw records in envelope: **57**; after cleaning: **57**
- Flags: {'approx_location': 30}

### Null rate per field

| field | null_% |
|---|---|
| fk | 0.0 |
| name | 0.0 |
| project | 0.0 |
| provider | 0.0 |
| lat | 0.0 |
| lon | 0.0 |
| elev_ft | 0.0 |
| total_depth_ft | 0.0 |
| n_values | 0.0 |
| lithology | 0.0 |
| lab | 0.0 |
| groundwater_depth_ft | 73.7 |
| test_types | 0.0 |
| depth_ft | 0.0 |
| test_type | 0.0 |
| uid | 0.0 |
| flags | 0.0 |
| log | 0.0 |

### `test_type` distribution

| test_type | n |
|---|---|
| SPT | 55 |
| Depth to groundwater table observation | 1 |
| Depth to groundwater table observation,The percentage of par | 1 |

### Normalized boring_type

| type | n |
|---|---|
| SPT | 55 |
| Other | 2 |

### Date formats (field `None`)

Share with a parsed year: **0.0%**; undated: **57**.

| format | n |
|---|---|
| null | 57 |

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| project | 100.0 | 11 |

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| geosetta_diggs:29.65398732;-82.41391143#ff7ae3de | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.413911 | 29.653987 |
| geosetta_diggs:29.65697928;-82.41652743#c618ebb3 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.416527 | 29.656979 |
| geosetta_diggs:29.65525635;-82.4149488#20da4274 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.414949 | 29.655256 |
| geosetta_diggs:29.6888682;-82.42318691#8e683156 | SPT | 129+19, 32.0' Lt. |  |  | 30.5 | geosetta_diggs:project=SPT BORINGS FOR ROADWAY STA. 129+19 - |  | -82.423187 | 29.688868 |
| geosetta_diggs:29.65453707;-82.41435742#d1faa4f1 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.414357 | 29.654537 |
| geosetta_diggs:29.65741689;-82.41690904#5282866a | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.416909 | 29.657417 |
| geosetta_diggs:29.57818442;-82.33643683#b078caf6 | SPT | 514+53, 42' LT |  |  | 21.5 | geosetta_diggs:project=STATE ROAD 25 BOX CULVERT REPAIR |  | -82.336437 | 29.578184 |
| geosetta_diggs:29.65541703;-82.41503896#970cec62 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.415039 | 29.655417 |
| geosetta_diggs:29.65582667;-82.41537391#20f7e847 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.415374 | 29.655827 |
| geosetta_diggs:29.65426943;-82.41413128#dfc05192 | SPT | ALACHUA COUNTY, FLORIDA |  |  | 6.5 | geosetta_diggs:project=S.R. 93 (INTERSTATE 75) NORTHBOUND OF |  | -82.414131 | 29.654269 |


## FDEP Cleanup Sites (active, all programs) (`fdep_cleanup`)

- URL: https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/CLEANUP_SP/MapServer/0
- Tier 2, kind `environmental_site`
- Raw records in envelope: **131**; after cleaning: **126**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| DEP_CLEANUP_SITE_KEY | 0.0 |
| SOURCE_DATABASE_NAME | 0.0 |
| SOURCE_DATABASE_ID | 0.0 |
| CPAC_PROGRAM_AREA_ID | 0.0 |
| CLCC_CLEANUP_CATEGORY_KEY | 0.0 |
| RSC2_REMEDIATION_STATUS_KEY | 0.0 |
| DATA_LOAD_DATE | 0.0 |
| CC2_COUNTY_ID | 0.0 |
| OC3_OFFICE_ID | 0.0 |
| BUSINESS_NAME | 0.0 |
| ADDRESS1 | 0.0 |
| ADDRESS2 | 90.8 |
| CITY | 0.0 |
| STCD1_STATE_ID | 0.0 |
| ZIP5 | 0.0 |
| ZIP4 | 29.0 |
| OIC_OBJECT_OF_INTEREST_ID | 0.0 |
| PC2_PROXIMITY_ID | 0.0 |
| CALC_COORD_ACCURACY_LEVEL_ID | 1.5 |
| CMC2_COORDINATE_METHOD_ID | 1.5 |
| DC4_DATUM_ID | 0.0 |
| VSC1_VERIFICATION_STATUS_ID | 19.8 |
| COLLECT_USERNAME | 0.0 |
| COLLECT_DATE | 8.4 |
| COLLECT_AFFILIATION | 44.3 |
| LATITUDE_DD | 0.0 |
| LATITUDE_MM | 0.0 |
| LATITUDE_SS | 0.0 |
| LONGITUDE_DD | 0.0 |
| LONGITUDE_MM | 0.0 |
| LONGITUDE_SS | 0.0 |
| MAP_SOURCE | 16.0 |
| MAP_SOURCE_SCALE | 16.0 |
| INTERPOLATION_SCALE | 86.3 |
| VERIFIER_USERNAME | 3.1 |
| VERIFIER_AFFILIATION | 45.0 |
| VERIFICATION_DATE | 3.1 |
| VERIFIED_COORDINATE_METHOD_ID | 5.3 |
| COMMENTS | 57.3 |
| DOCUMENTS | 0.0 |
| OBJECTID | 0.0 |

### Normalized boring_type

| type | n |
|---|---|
| Site | 126 |

### Date formats (field `None`)

Share with a parsed year: **0.0%**; undated: **126**.

| format | n |
|---|---|
| null | 126 |

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| SOURCE_DATABASE_ID | 100.0 | 126 |

### Hostnames in `DOCUMENTS`

| host | n |
|---|---|
| prodenv.dep.state.fl.us | 131 |

Examples: <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/9401874/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/9818287/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/FLD980711071/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/FLD000823393/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3780/facility!search>

### Layer attachments

```
{
 "hasAttachments": false
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fdep_cleanup:507 | Site | JOONS BEAUTY SUPPLY & WIGS INC |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=9401874 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.329108 | 29.659662 |
| fdep_cleanup:1045 | Site | SANTA FE COLLEGE BLOUNT HALL - E PARKING LOT |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=9818287 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.329538 | 29.652159 |
| fdep_cleanup:1079 | Site | Processing and Storage Building (PSB) - SWMU 4 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_16399 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.349931 | 29.716815 |
| fdep_cleanup:1118 | Site | 3,000-Gallon Waste Liquids Tank - SWMU 6 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_16401 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.349931 | 29.716815 |
| fdep_cleanup:1162 | Site | Former Landfill - SWMU 1 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_16228 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.368031 | 29.63182 |
| fdep_cleanup:1180 | Site | Decommissioned Outdoor Rifle Range - SWMU 30 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_18906 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.345728 | 29.643589 |
| fdep_cleanup:1235 | Site | Cabot - Koppers |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_3780 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.326671 | 29.678175 |
| fdep_cleanup:1275 | Site | PCB Commercial Storage Area - SWMU 42 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_18936 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.349423 | 29.716968 |
| fdep_cleanup:1287 | Site | Tacachale Part A-2002 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_6137 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.301392 | 29.666672 |
| fdep_cleanup:1342 | Site | IFAS Building 63 University of Florida Campus Part B-2010 |  |  |  | fdep_cleanup:SOURCE_DATABASE_ID=ERIC_6205 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.357329 | 29.638744 |


## FDEP Petroleum Discharges (incl. closed) (`fdep_petroleum`)

- URL: https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/DWM_STCM/MapServer/2
- Tier 2, kind `environmental_site`
- Raw records in envelope: **362**; after cleaning: **309**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| FACILITY_ID | 0.0 |
| COUNTY | 0.0 |
| FACILITY_NAME | 0.0 |
| DISCHARGE_ID | 0.0 |
| DISCHARGE_DATE | 0.0 |
| DISCHARGE_SCORE | 23.5 |
| ELIGIBILITY | 0.0 |
| ELIGIBILITY_PROGRAM | 37.0 |
| GENERAL_CLEANUP_STATUS | 0.0 |
| DISCHARGE_CLEANUP_STATUS | 0.0 |
| DISCH_CLEANUP_STATUS_EFF_DATE | 0.3 |
| REPORT_PHASE | 1.4 |
| REPORT_SUBPHASE | 1.4 |
| REPORT_SUBPHASE_DATE | 1.4 |
| TANK_OFFICE | 28.2 |
| STAFF_ASSIGNED | 78.2 |
| ADDRESS | 0.0 |
| CITY | 0.0 |
| ZIP5 | 0.0 |
| FACILITY_TYPE | 0.0 |
| FACILITY_STATUS | 0.0 |
| LAT_DD | 0.0 |
| LAT_MM | 0.0 |
| LAT_SS | 0.0 |
| LONG_DD | 0.0 |
| LONG_MM | 0.0 |
| LONG_SS | 0.0 |
| DATUM | 0.0 |
| REL_FEAT | 0.0 |
| COLLECTION_METHOD | 0.0 |
| COLLECTOR_NAME | 0.0 |
| COLLECTION_DATE | 0.0 |
| DOCUMENT_LINK | 0.0 |
| OBJECTID | 0.0 |

### Normalized boring_type

| type | n |
|---|---|
| Site | 309 |

### Date formats (field `DISCHARGE_DATE`)

Share with a parsed year: **100.0%**; undated: **0**.

| format | n |
|---|---|
| epoch_ms | 309 |

Year range: 1977–2025, median 1988.

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| FACILITY_ID | 100.0 | 309 |

### Hostnames in `DOCUMENT_LINK`

| host | n |
|---|---|
| prodenv.dep.state.fl.us | 362 |

Examples: <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/8500032/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/8500035/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/8500038/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/8500039/facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/8500049/facility!search>

### Layer attachments

```
{
 "hasAttachments": false
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fdep_petroleum:358 | Site | ALACHUA CNTY- PUBLIC WORKS GARAGE | 220924800000 | 1977 |  | fdep_petroleum:FACILITY_ID=8626841 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.404779 | 29.766328 |
| fdep_petroleum:249 | Site | DIXON OIL CORP | 358300800000 | 1981 |  | fdep_petroleum:FACILITY_ID=8626921 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.322415 | 29.682089 |
| fdep_petroleum:194 | Site | GAINESVILLE REGIONAL AIRPORT RENTAL CAR FAC | 399686400000 | 1982 |  | fdep_petroleum:FACILITY_ID=8500204 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.278926 | 29.685828 |
| fdep_petroleum:247 | Site | UNITED RENTAL | 403660800000 | 1982 |  | fdep_petroleum:FACILITY_ID=8626910 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.327671 | 29.659604 |
| fdep_petroleum:521 | Site | HANRAHAN ROBERT & MARY ELLEN RESIDENCE | 412905600000 | 1983 |  | fdep_petroleum:FACILITY_ID=9047510 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.379859 | 29.667326 |
| fdep_petroleum:95 | Site | TEXACO #110-0018 | 415324800000 | 1983 |  | fdep_petroleum:FACILITY_ID=8500296 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.372136 | 29.628265 |
| fdep_petroleum:221 | Site | ARCHER SHELL | 432345600000 | 1983 |  | fdep_petroleum:FACILITY_ID=8500252 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.372069 | 29.627611 |
| fdep_petroleum:222 | Site | SHELL-THOMAS | 460339200000 | 1984 |  | fdep_petroleum:FACILITY_ID=8500253 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.338823 | 29.653781 |
| fdep_petroleum:303 | Site | UNIV OF FL STRUCTURES & MATERIALS LAB #1626 | 463881600000 | 1984 |  | fdep_petroleum:FACILITY_ID=8732506 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.299679 | 29.672251 |
| fdep_petroleum:459 | Site | TURKEY CREEK INC | 483753600000 | 1985 |  | fdep_petroleum:FACILITY_ID=8943125 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.412108 | 29.755164 |


## FDEP Drycleaning Solvent Cleanup Sites (`fdep_drycleaning`)

- URL: https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/DWM_STCM/MapServer/4
- Tier 2, kind `environmental_site`
- Raw records in envelope: **18**; after cleaning: **18**
- Flags: none

### Null rate per field

| field | null_% |
|---|---|
| ERIC_ID | 0.0 |
| NAME | 0.0 |
| ADDRESS | 0.0 |
| CITY | 0.0 |
| COUNTY | 0.0 |
| DISTRICT | 0.0 |
| PROGRAM | 0.0 |
| STATUS | 0.0 |
| MANAGER | 0.0 |
| LAT_DD | 0.0 |
| LAT_MM | 0.0 |
| LAT_SS | 0.0 |
| LONG_DD | 0.0 |
| LONG_MM | 0.0 |
| LONG_SS | 0.0 |
| DATUM | 0.0 |
| HAZ_ARC_ID | 0.0 |
| DOCUMENTS | 0.0 |
| OBJECTID | 0.0 |

### Normalized boring_type

| type | n |
|---|---|
| Site | 18 |

### Date formats (field `None`)

Share with a parsed year: **0.0%**; undated: **18**.

| format | n |
|---|---|
| null | 18 |

### Report-key candidates

Normalized before keying: nothing.

| key | non_null_pct | distinct |
|---|---|---|
| ERIC_ID | 100.0 | 18 |

### Hostnames in `DOCUMENTS`

| host | n |
|---|---|
| prodenv.dep.state.fl.us | 18 |

Examples: <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3980/gis-facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3985/gis-facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3987/gis-facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3998/gis-facility!search>, <https://prodenv.dep.state.fl.us/DepNexus/public/electronic-documents/ERIC_3983/gis-facility!search>

### Layer attachments

```
{
 "hasAttachments": false
}
```

### Sample rows (10)

| boring_uid | boring_type | boring_name | date_raw | year | depth_ft | report_key | doc_url | lon | lat |
|---|---|---|---|---|---|---|---|---|---|
| fdep_drycleaning:190 | Site | Custom Care Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3980 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.379732 | 29.651514 |
| fdep_drycleaning:191 | Site | Town & Country Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3985 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.423195 | 29.661713 |
| fdep_drycleaning:246 | Site | Alpine Dry Cleaners Inc |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3987 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.365985 | 29.702789 |
| fdep_drycleaning:412 | Site | Rips Cleaners - One Hour |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3998 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.329067 | 29.661228 |
| fdep_drycleaning:431 | Site | Plaza Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3983 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.339424 | 29.653612 |
| fdep_drycleaning:552 | Site | Robinsons Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3984 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.322595 | 29.666299 |
| fdep_drycleaning:557 | Site | Suburban Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3995 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.369228 | 29.699997 |
| fdep_drycleaning:813 | Site | Cranes One Hour Dry Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3979 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.320458 | 29.673611 |
| fdep_drycleaning:957 | Site | Suburban Cleaners |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3996 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.373095 | 29.632793 |
| fdep_drycleaning:966 | Site | Quality Cleaners of Gainesville Inc |  |  |  | fdep_drycleaning:ERIC_ID=ERIC_3976 | https://prodenv.dep.state.fl.us/DepNexus/public/electronic-d | -82.386848 | 29.674189 |


## Reports (M2)

- Reports built: **577**; borings in reports: **991** (= sum of n_borings: 991); borings without a key: **0**.
- Reports spanning > 5 km (corridor project or bad key): **1**

  - `fdot_d2:FIN=44703215201` — 26 borings, 5042 m
