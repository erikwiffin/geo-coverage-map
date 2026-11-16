# Geotechnical Report Coverage Map: Build Spec

**Status:** v1 spec, ready to build
**Pilot area:** Gainesville, FL (Alachua County, FDOT District 2)
**Audience:** Claude Code (build agent) and the project owner

---

## 1. Goal

Build a tool that shows where publicly available geotechnical borings and reports exist in a town, how dense and how recent that coverage is, and where the gaps are. It has two parts:

1. **A data pipeline** (Python). It pulls boring and report locations from public sources, normalizes them into one schema, tags each record with a license tier, groups borings into reports, and computes area-based coverage statistics.
2. **An interactive web map** (static site). It shows the borings, report footprints and a coverage surface, with filters (license tier, boring type, source, date, distance threshold) and a live stats panel.

The headline question the tool answers: *what share of the city's area lies within R metres of at least one public report, and where are the gaps?*

### Non-goals for v1

- Address- or parcel-weighted statistics. Coverage is **area-based**. Address weighting can come later (see §12).
- Downloading or parsing report PDFs. v1 stores **links only**.
- A statewide or national crawl. The architecture must make that possible later through config only.
- A backend server, user accounts or a database. Output is static files.

---

## 2. Key concepts

| Term | Definition |
|---|---|
| **Boring** | One exploration point (SPT, CPT, auger, well, etc.) with a location, source, type, date, and a link to its document when one is available. |
| **Report** | A document that groups one or more borings. In FDOT data, a report is approximated by a grouping key (see §4.1). |
| **Report footprint** | The union of buffers (default 30 m) around the report's borings. If the report has 3 or more borings, also store their convex hull. Store a centroid too. |
| **License tier** | How freely a record can be reused. Tiers are cumulative: "tier ≤ 2" means tiers 1 and 2. See §8. |
| **Covered (at R)** | An H3 cell inside the city boundary is covered if its center lies within R metres of at least one boring that passes the active filters. |
| **Coverage %** | Covered cells ÷ all cells inside the boundary. H3 cells are near-equal-area, so this is an area share. |

---

## 3. Architecture and repo layout

```
geotech-coverage/
  SPEC.md                      # this file
  README.md                    # setup, run, network domains
  pyproject.toml
  config/
    area.gainesville.yaml      # boundary query, H3 resolution, radii, buffer sizes
    sources.yaml               # source registry (see §4)
  pipeline/                    # Python package
    __main__.py                # CLI: check-network | fetch | build | stats | all
    arcgis.py                  # paged ArcGIS REST client, retries, on-disk cache
    sources/
      fdot_soil_borings.py
      fgs_wells.py
      csv_source.py            # generic lat/lon CSV import (USGS, manual, exports)
      geosetta.py              # optional, phase M5, needs API key
    normalize.py               # source -> common schema
    reports.py                 # grouping + footprints
    coverage.py                # H3 grid, nearest-distance, stats, gap detection
    profile.py                 # data profiling report
  data/
    raw/                       # cached API responses (gitignored)
    processed/                 # outputs consumed by the web app (see §5.3)
  web/                         # Vite + TypeScript + maplibre-gl + h3-js + kdbush/geokdbush
  tests/
    fixtures/                  # recorded API responses + synthetic geometry
```

**Python stack:** Python ≥ 3.11, `requests`, `pandas`, `geopandas`, `shapely>=2`, `pyproj`, `h3>=4`, `pyarrow`, `pyyaml`, `matplotlib`, `pytest`.

**Web stack:** Vite, TypeScript, `maplibre-gl`, `h3-js`, `kdbush` + `geokdbush` (nearest-neighbour search), no UI framework required. The build output is a static site that can be deployed to GitHub Pages or similar.

---

## 4. Data sources

Every source is defined in `config/sources.yaml`, so adding a source or a city is a config change, not a code change:

```yaml
- id: fdot_d2
  adapter: arcgis
  url: https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soil_Boring_viewer/MapServer/0
  where: "1=1"
  tier: 2
  kind: geotechnical
  field_map: { native_id: OBJECTID, boring_name: BORENUM, type: TYPE, date: BOREDATE,
               doc_url: DOC_LINK, doc_name: DOC_NAME, doc_id: DOC_ID, project: PROJNUM,
               fin: FIN, consultant: CONSULTANT, elev: ELEV, gw: GR_WTR, county: COUNTY }
  report_key: [DOC_ID, DOC_LINK, [FIN, PROJNUM, DOC_NAME]]   # first non-null wins
```

### 4.1 FDOT District 2 soil borings (primary source, v1)

- **Service:** `https://gis.fdot.gov/arcgis/rest/services/Soil_Boring/D2_Soil_Boring_viewer/MapServer`, layer `0` ("District 2 Soil Boring Locations"). The service is described as shared with everyone and used in FDOT's public Soil Boring viewer. Alachua County is in FDOT District 2.
- **Geometry:** points. Native spatial reference is EPSG:3087 (Florida GDL Albers). Always request `outSR=4326`.
- **Limits and capabilities (as published):** `maxRecordCount` 1000. Supports pagination, JSON/geoJSON/PBF, query with distance, statistics and distinct values. Has attachments.
- **Fields:** `OBJECTID, BORENUM, BOREDATE (string), TYPE, DOC_LINK, DOC_NAME, DOC_ID (double), FIN, PROJNUM, ITEM, ITEMSEG, PHASE, PROJDESC, PERCOLATION, STATION, OFFSET, REF_RAMP, DISTRICT, COUNTY, PSEE, SHEET, NOTES, CONSULTANT, USER_NAME, ELEV, GR_WTR, LAT, LON`.
- **`TYPE` values seen in the renderer:** `Auger`, `CPT`, `SPT`.
- **No depth field.** `depth_ft` will be null for this source unless it can be derived from another field. Don't invent it.
- **Report grouping:** use `DOC_ID`, then `DOC_LINK`, then `(FIN, PROJNUM, DOC_NAME)`. **Verify empirically** in M1 (see §10) and document the choice in `profile.md`.
- **Fetch method:** `returnIdsOnly=true` with a spatial envelope (the city boundary bbox plus the largest radius), then fetch features in batches of ≤ 500 object IDs via POST. Alternatively use `resultOffset`/`resultRecordCount` pagination. Filter spatially on the server; never pull the whole district.
- **Expansion later:** the same folder has `D1_D7_Soil_Boring_viewer`, `D3_Soil_Boring_viewer` and `D5_Soil_Boring_viewer`. Ignore `TPIKE_Soil_Boring_viewer`, which is tagged "test".

### 4.2 City boundary (v1)

- **Source:** US Census TIGERweb, Incorporated Places (2025 vintage), at `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4`. The data is public domain.
- **Query:** Gainesville, Florida. The GEOID is expected to be `1225175`, but **verify** the field names and value before relying on them. Request `outSR=4326` as GeoJSON.
- Configure it in `area.gainesville.yaml` so another city is just a different query.

### 4.3 Florida Geological Survey wells (M5, optional layer)

- **Service:** `https://ca.dep.state.fl.us/arcgis/rest/services/OpenData/FGS_WELLS/MapServer/0`
- Most of these are deep geologic or water wells, not geotechnical borings. Set `kind: geologic_well` and **hide them by default** in the UI and in the headline stats.
- Inspect the schema in M5 and map depth if a depth field exists.

### 4.4 CSV import (M5)

A generic adapter reads a CSV with `lat, lon` and optionally `source, tier, kind, type, date, depth_ft, doc_url, report_key`. Use it for USGS data releases, manual additions and exports from other tools.

### 4.5 Geosetta (M5, optional)

- **API docs:** https://geosetta.org/api_docs/ (read these before implementing; don't guess the payload).
- **Radius query:** `POST https://geosetta.org/web_map/api_key/` with `deliverableType: "Return_Historic_Data_In_Radius"`. The radius is capped at 5 km and each call returns at most 500 borings. To cover the city, tile it with overlapping circles.
- **Limits:** the data API allows 100 requests per hour. Commercial use requires a data access fee.
- **Terms:** the data is **not** described as public domain, and redistributed outputs must keep Geosetta's disclaimer. Set `tier: 4`, keep the disclaimer in `manifest.json`, and show it in the UI when this source is on.
- Read the key from the `GEOSETTA_API_KEY` environment variable and never commit it. Skip the source cleanly if the key isn't set.
- **De-duplication:** Geosetta aggregates DOT data, so it will overlap FDOT records (see §5.2).

### 4.6 Basemap

OpenFreeMap vector tiles (no API key needed), for example the style at `https://tiles.openfreemap.org/styles/positron` or `.../liberty`. Show OSM attribution. Make the style URL configurable.

---

## 5. Pipeline

### 5.1 Normalized boring schema (`borings.geojson` / `borings.parquet`)

| Column | Type | Notes |
|---|---|---|
| `boring_uid` | str | `"{source_id}:{native_id}"` |
| `source_id`, `tier`, `kind` | str/int/str | from the source config |
| `boring_type` | str | normalized: `SPT`, `CPT`, `Auger`, `Well`, `Other` |
| `boring_name` | str | native label (e.g. `BORENUM`) |
| `date_raw`, `date`, `year` | str / ISO date / int | parse what can be parsed, keep the raw string, leave the rest null |
| `depth_ft`, `elev`, `gw` | float or null | |
| `report_key` | str | see §4.1 |
| `doc_url`, `doc_name`, `project`, `consultant` | str or null | |
| `lon`, `lat` | float | WGS84 |
| `attrs` | JSON | all original attributes, untouched |

### 5.2 Cleaning

- Drop records with null or zero coordinates. Flag points outside the county or with obviously swapped lat/lon.
- **Cross-source de-duplication:** treat points within 5 m (configurable) of each other with compatible type as the same boring. Keep the record with the lowest tier, and record which sources it was merged from in a `also_in` field.
- **Within-source duplicates:** collapse exact coordinate plus `boring_name` duplicates.

### 5.3 Outputs (`data/processed/`)

- `boundary.geojson`
- `borings.geojson` (plus `.parquet`)
- `reports.geojson`: report footprints, with `report_key, source_id, tier, doc_name, doc_url, n_borings, types, date_min, date_max`
- `stats.json`: default-filter coverage stats (§6)
- `coverage_curve.png`: % area covered vs radius, one line per cumulative tier
- `manifest.json`: for each source, the URL, fetch timestamp, record counts (raw / in area / after dedupe), tier, license note and disclaimer text
- `profile.md`: the data profiling report (§10)

### 5.4 Fetching etiquette

- Send no more than about 2 requests per second per host. Retry with exponential backoff on 429, 5xx and timeouts.
- Set a `User-Agent` that includes a project name and contact email (configurable).
- Cache raw responses in `data/raw/` keyed by a hash of the URL and parameters. Re-run from cache by default; `--refresh` forces a refetch.

---

## 6. Coverage computation

### 6.1 Python (authoritative)

1. Polyfill the boundary with H3 cells using center containment. The default resolution is **10** (cells average about 0.015 km², edge about 66 m). Use resolution **11** automatically when the smallest radius is under 100 m, because otherwise cell size dominates the error.
2. For each cell center and each filter set, compute the haversine distance to the nearest qualifying boring.
3. Compute these statistics for radii `[50, 100, 250, 500, 1000]` m (configurable):
   - % of area covered, cumulative by tier (≤1, ≤2, ≤3, ≤4)
   - % covered by boring type (all, SPT+CPT only, excluding wells)
   - % covered by recency (all years, 2000 and later, 2015 and later)
   - the number of distinct reports within 250 m of each cell (distribution: median, p90)
   - **gaps:** connected clusters of cells not covered at 500 m, ranked by area, top 10, with centroid and area
4. Write `stats.json` and `coverage_curve.png`.

### 6.2 Web (interactive)

- Load the boundary, borings and reports. Build the H3 cell set in the browser with `h3-js` at the same resolution.
- When a filter changes, rebuild the nearest-neighbour index over the filtered borings (`geokdbush`), recompute each cell's distance, and update the map and stats panel.
- **Performance target:** recompute in under 200 ms for about 20k cells and 10k borings on a laptop.
- **Consistency:** for the default filters, the web stats must match `stats.json` to within 0.5 percentage points. Add an automated test.

---

## 7. Web app requirements

**Map layers (all toggleable):**

- City boundary outline
- **Coverage hexes**, coloured either by distance to the nearest qualifying boring (bins 0–50, 50–100, 100–250, 250–500, 500–1000, >1000 m; sequential palette, light means far) or by the number of reports within R. The user switches between the two.
- **Borings**: colour by type, with lower opacity or a hollow marker for higher tiers. Cluster at low zoom.
- **Report footprints**: polygons with a light fill.
- **Gaps**: outline the top-N uncovered clusters.

**Controls:**

- Coverage radius R (slider or presets: 50, 100, 250, 500, 1000 m)
- Maximum tier (radio buttons, cumulative)
- Boring types (checkboxes)
- Sources (checkboxes; geologic wells off by default)
- Year range (slider; include an "undated" toggle)
- Colour-by mode (distance / report count)

**Stats panel (live):** % of city area covered at the current R and filters, plus the number of borings, number of reports, median distance to the nearest boring, and a small coverage-vs-radius sparkline.

**Popups:**

- **Boring:** name, type, date, source, tier, elevation and water level if present, document link
- **Report:** name, link, number of borings, date range, license note
- **Hex:** distance to nearest boring, number of reports within R

**Footer and about panel:** data sources with links and fetch dates (from `manifest.json`), the license tier explanation, the basemap attribution, the Geosetta disclaimer when that source is on, and a statement that the map is **not for design use** and that locations are approximate.

**Export:** the current stats as CSV, and the filtered borings as GeoJSON.

**Accessibility:** the colour palette must be legible for colour-blind users, and every control must be keyboard-operable.

---

## 8. Licensing and provenance

| Tier | Meaning | v1 examples |
|---|---|---|
| 1 | US federal work (public domain) | USGS data releases (via CSV import) |
| 2 | Florida agency public record. Likely free to reuse: in *Microdecisions v. Skinner* (Fla. 2d DCA 2004), a Florida appeals court held that an agency can't claim copyright in a public record without legislative authorization. | FDOT soil borings, FGS wells, Census TIGER (federal, so tier 1 for the boundary) |
| 3 | Open license that requires attribution (CC BY, OGL) | none in Gainesville v1 |
| 4 | Accessible under terms of use or a disclaimer | Geosetta |

**Caveats to show in the about panel and README:**

- Reports written by private consultants and hosted by an agency may still carry the consultant's copyright.
- University-held reports (for example, from the University of Florida) are excluded.
- This is not legal advice.

The tier assigned to each source is set in `sources.yaml` and recorded in `manifest.json`.

---

## 9. Milestones and acceptance criteria

**M0: Scaffold and network check**
- Repo layout, `pyproject.toml`, lint (ruff) and `pytest` running.
- `python -m pipeline check-network` sends one lightweight request to every configured host and prints reachable / blocked (HTTP 403 with `x-deny-reason: host_not_allowed` means the sandbox allowlist is blocking it) / error. Run this first and report the results.

**M1: Boundary and FDOT fetch, normalize, profile**
- Fetch the boundary and the FDOT D2 borings within the boundary bbox plus 1 km.
- `profile.md` must include: record counts; null rate per field; `TYPE` distribution; `BOREDATE` formats found and the share parsed; the number of distinct `DOC_ID`, `DOC_LINK` and `(FIN, PROJNUM)` values; **the distinct hostnames found in `DOC_LINK`**; whether layer attachments exist on a sample of features; and a sample of 10 rows.
- **Acceptance:** schema validated; every point inside the envelope; profile written.

**M2: Reports and footprints**
- Choose the report key based on the profile and record the rationale in `profile.md`. Build the footprints.
- Flag any report whose borings span more than 5 km (likely a corridor project or a bad key).
- **Acceptance:** `reports.geojson` is written; the number of borings across all reports equals the number of borings with a non-null key; flagged reports are listed.

**M3: Coverage statistics CLI**
- Implement §6.1. Unit tests use synthetic fixtures with known answers: for example, one boring at the center of a disc-shaped boundary gives coverage ≈ (R/r)².
- **Acceptance:** `stats.json` and `coverage_curve.png` are written; tests pass offline.

**M4: Web map**
- Implement §6.2 and §7. Run `npm run build` to produce a static site in `web/dist`.
- **Acceptance:** all filters work; the default stats match `stats.json` within tolerance (automated test); take a headless screenshot if a browser is available.

**M5: More sources**
- FGS wells, the CSV adapter, the optional Geosetta adapter, and other FDOT districts or cities through config only.
- **Acceptance:** adding a new city requires only a new `area.*.yaml` and source entries.

---

## 10. Open questions (resolve in M1 and report back)

1. **Where do `DOC_LINK` URLs point?** Which host(s), and are the documents public without a login? The project owner will need to allowlist those hosts (see §11). Are the PDFs also available as layer attachments?
2. Is `DOC_ID` a reliable report key, or does one document cover several projects (or one project several documents)?
3. Which `BOREDATE` formats appear, and how many records are undated?
4. Can depth be recovered from any FDOT field (for example `NOTES`)? If not, leave it null.
5. Confirm the TIGERweb field names and Gainesville's GEOID.
6. Does the USGS CPT repository (doi:10.5066/P13M3WVY) contain any points near Gainesville? If so, import them as tier 1 via CSV.

---

## 11. Network access (sandboxed environments)

The pipeline and its tests need these hosts. Package registries (PyPI, npm) and GitHub are usually allowed already.

**Required for v1:**
```
gis.fdot.gov
tigerweb.geo.census.gov
```
**Recommended:**
```
ca.dep.state.fl.us          # FGS wells (M5)
tiles.openfreemap.org       # basemap, only needed for headless screenshots during development
```
**Optional / later:**
```
geosetta.org                # Geosetta API (needs key)
data.usgs.gov
www.sciencebase.gov         # USGS data release downloads
services1.arcgis.com        # Alachua County address points (only if address weighting is added)
<DOC_LINK host(s)>          # discovered in M1, needed only if PDFs are ever downloaded
```
When a request is blocked, the error names the host; add it to the allowlist and rerun `check-network`.

---

## 12. Later ideas (out of scope for v1)

- Address- or building-weighted coverage (Alachua County E911 address points or building footprints) as a second metric alongside area.
- A geology-aware coverage rule: only count a boring if it lies in the same mapped surficial unit as the cell (FGS geologic map).
- PDF retrieval and extraction (boring logs → SPT N, USCS layers, depth) with a vision-language model.
- Statewide FDOT coverage, then other states via the sources registry.
- Change tracking: re-fetch monthly and diff the manifests.

---

## 13. Working rules for the build agent

- Keep everything config-driven, with no hard-coded city or source logic outside the adapters.
- Tests must run offline using recorded fixtures in `tests/fixtures/`. Record those fixtures once the network is available.
- Never commit secrets or raw cached data. Add `data/raw/` to `.gitignore`.
- Don't download report PDFs in v1.
- When a source behaves differently from this spec (fields, limits, formats), follow the source, update this spec's §4 and note the change in `profile.md`.

---

## 14. Build notes (deviations found while building; see §13)

- **2026-11-15, FDOT access:** from the cloud build sandbox, `gis.fdot.gov` returns HTTP 403 with
  an *Azure WAF* block page, even with an honest project `User-Agent`. The block comes from FDOT's
  firewall, not the sandbox allowlist. `check-network` reports it as "BLOCKED by remote host".
  The FDOT adapter and report-key logic are implemented and tested against **synthetic**
  FDOT-shaped fixtures; M1/M2 questions about FDOT (§10 Q1–Q4) stay open until a fetch succeeds
  from a network FDOT allows.
- **TIGERweb (§10 Q5):** confirmed. Layer 4 = Incorporated Places; `GEOID='1225175'` →
  `NAME='Gainesville city'`, `BASENAME='Gainesville'`, `STATE='12'`.
- **FGS wells (§4.3):** fields include `TOTAL_DEPTH` (mapped to `depth_ft`), `DRILL_DATE`
  (epoch ms), `DRILL_YEAR` (fallback), `REPORT_LINK` (all links → `geodes.kyrasolutions.com`).
  157 wells in the Gainesville envelope; no layer attachments.
- **H3 resolution:** the `auto` rule picks res 11 because the default radii include 50 m, which
  gives about 84.6k cells (spec §6.2's perf target assumed about 20k). The web app computes stats
  at the same resolution and **draws** hexes one level coarser when there are more than 30k cells.
- **Nearest-neighbour search (web):** geokdbush took about 370 ms per recompute at res 11, so the
  app uses a bucket-grid search in local metres with a haversine final distance (`web/src/nn.ts`,
  about 16 ms for 94k cells × 10k borings). It's tested against geokdbush for correctness.
- **Adapters:** one generic `arcgis` adapter serves FDOT and FGS; source differences live in
  `sources.yaml` (`field_map`, `fixed_type`, `report_key`, `default_on`).
- **stats.json** has an extra `pct_covered_all_sources` block (wells included) so the web
  consistency test can run against real data while the default sources are empty.
- **USGS CPT repository (§10 Q6):** resolved. doi:10.5066/P13M3WVY → ScienceBase item
  `67ffc46ed4be024303209582`. The index `usgs_cpt_index.csv` has 1,823 soundings in 14 states and
  **none in Florida**; the nearest is Charleston, SC, about 382 km from Gainesville. Nothing to import
  for v1. Index columns (`ID, Latitude, Longitude, Date (YYYYMMDD), Total_Depth (m), WT_Depth`)
  map to the CSV adapter if another city needs them.
- **FDOT mirror search (2026-11-15):** FDOT's ArcGIS Online org (`services1.arcgis.com/O1JpcwDW8sjYuddV`,
  1,605 services) has no soil-boring, geotech or drilling layer; the Soil Boring viewer data is
  only on `gis.fdot.gov`. `www.arcgis.com` (portal search) was not reachable, so other orgs
  weren't searched.
- **FDOT D2, first real data (2026-11-16, browser-saved query, 418 records in the envelope; 412
  inside the client-side bbox):** answers to §10 Q1–Q4:
  1. **`DOC_LINK` is not public.** 277 links point to `http://dotsd2ww01.dot.state.fl.us/intranet/...`,
     a host that doesn't resolve publicly. 141 are Windows UNC paths
     (`\\dotad2cohesity\Static Data\219\MR\<FIN>\<sheet>.pdf`). The adapter moves them to
     `doc_internal` (config `internal_doc_patterns`) and leaves `doc_url` null; the map says
     the document is internal and must be requested as a public record. The layer reports
     `hasAttachments: true`; whether attachments are populated is still unchecked, because the
     WAF blocks scripted probes.
  2. **`DOC_ID` is always null and `DOC_LINK` points at individual log sheets** (71 distinct).
     The report key is now **`FIN`** (FDOT financial project number), normalized to digits
     because it appears both as `447962-1-52-01` and `44796215201`. Order: `[DOC_ID, FIN,
     DOC_LINK]`. Result: 22 reports, one spanning more than 5 km (`44703215201`, 5.04 km, a
     corridor project).
  3. **`BOREDATE`:** 81% null; the rest are all `MM/DD/YYYY`, from 2018 to 2025.
  4. **No depth.** `NOTES` holds a sequence number and `CONSULTANT` the log PDF's file name, so
     neither is mapped. `depth_ft` stays null.
  - `TYPE`: 271 SPT, 141 Auger, 0 CPT. For Auger records `BORENUM` is the station (e.g. `150+35`).
- **Coverage, default filters (FDOT only), 2026-11-16:** 0.5% / 1.2% / 4.4% / 11.8% / 27.2% of
  city area within 50 / 100 / 250 / 500 / 1000 m. With borings from 2000 onward only: 12.8% at 1 km.
  The median distance from a city cell to the nearest boring is 1.77 km.
- **Geosetta via DIGGS area exports (2026-11-16, M5 partly done):** with no API key, the user drew
  an area on geosetta.org and exported the DIGGS viewer HTML (Geosetta's disclaimer comment plus an
  embedded DIGGS 3 document). The new `diggs` adapter reads `*.html` and `*.xml` from
  `data/manual/geosetta/`: boreholes, SPT N-values, lab tests (water content, fines, LL) and
  USCS lithology, depths in feet. The disclaimer is saved to `DISCLAIMER.txt`, carried in the
  manifest, and shown in the map's About panel and as a notice whenever Geosetta data is visible.
  Source `geosetta_diggs`, tier 4.
  - First export: 47 boreholes. **27 matched FDOT D2 borings within 5 m.** Their parsed log
    (`depth_ft`, `log`) now *enriches* the FDOT boring (cross-source dedupe fills `ENRICH`
    columns from the dropped duplicate; `log_from` records where it came from), so 26 FDOT
    borings now have depth and N-values (one received two co-located Geosetta boreholes).
  - **20 new boreholes in 5 non-FDOT reports**, all from Geosetta's "Automated Web Crawl": GRU
    Deerhaven pond embankment (6), Plum Creek Property (6), Boulware Springs Improvements (5),
    Malcom Randall VA Medical Center boiler building (3). All are placed at a geocoded report
    site, and several are visibly misplaced (Deerhaven and Boulware Springs by kilometres, the VA
    by about 1 km). They're flagged `approx_location` (several boreholes on one exact coordinate,
    or no more than 4 decimal places) and the popup says so. They still count toward coverage.
  - Co-located boreholes are kept apart (`keep_colocated`); identity = Geosetta functional key
    `lat;lon` + content hash, so overlapping exports don't double count.
- **More Geosetta exports (2026-11-16):** export 2 is an FDOT bridge (SR 26 over US 301, near
  Hawthorne), about 7 km outside the fetch envelope, so it's correctly excluded. Export 3 adds 10
  boreholes for "Alachua County Mill Creek Sink", inside the envelope but outside the city limits,
  all at one approximate site. Geosetta total now: 63 boreholes read, 57 in the envelope, 27
  enriching FDOT borings, 30 new (all `approx_location`).
- **FDEP contamination cleanup sites (2026-11-16), new kind `environmental_site`:** three layers
  on `ca.dep.state.fl.us` (scripted access works):
  `CLEANUP_SP/0` DEP Cleanup Sites (131 active/open/on-hold, all programs), `DWM_STCM/2`
  petroleum discharges (362 discharges at 309 facilities, incl. closed), `DWM_STCM/4` drycleaning
  (18). They overlap, so a new `site_id` column (facility ID or ERIC ID) merges records across
  sources regardless of distance, and `collapse_on_site_id` keeps one point per facility (the
  earliest discharge). Result: 364 facilities (126 + 236 + 2). Each links to its public DEP
  Nexus document search, where site assessment reports with shallow boring and monitoring-well
  logs live. Facilities aren't borings, so the kind is off by default and excluded from the
  headline stats. `stats.json` gains `pct_covered_with_environmental_sites`: 4.7% → 18.1% at
  250 m, and 29.7% → 73.1% at 1 km.
- **USGS NWIS groundwater sites (2026-11-16):** new `usgs_nwis` adapter for the
  `waterservices.usgs.gov/nwis/site/` RDB service (bounding box, `siteType=GW`,
  `siteOutput=expanded`). 28 sites, 23 with well depth (80 to 3,167 ft), built 1968–2004. Tier 1,
  kind `geologic_well` (hidden by default like the FGS wells). Each links to its
  waterdata.usgs.gov monitoring-location page. The FGS `USGS_ID` field holds old local well numbers
  (e.g. `936-220-1`), not NWIS site numbers, so the two can't be matched by id. Five USGS sites
  sit 11–35 m from an FGS well (possibly the same wells at different coordinate precision) and are
  not merged at `dedupe_m = 5`.
- **Water management district well permits: blocked.** Alachua County is split between the St.
  Johns River WMD (SJRWMD) and the Suwannee River WMD (SRWMD). SJRWMD well data appears to be on
  `permitting.sjrwmd.com` (ArcGIS `sjrRegMapICR` MapServer, which includes well depth, casing and
  use) and in a "Well completion report sites" dataset on `data-floridaswater.opendata.arcgis.com`.
  Both hosts are blocked by the sandbox. No public SRWMD well-permit layer was found.
