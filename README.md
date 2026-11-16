# geotech-coverage

Where do public geotechnical borings and reports exist in a town, how dense and recent is that
coverage, and where are the gaps? Pilot: **Gainesville, FL**. Full requirements: [SPEC.md](SPEC.md).

- `pipeline/` (Python): fetches sources, normalizes them into one schema, groups borings into
  reports, and computes area-based H3 coverage statistics.
- `web/` (Vite + TypeScript + MapLibre): a static interactive map with live filters and stats.

## Setup

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cd web && npm install && cd ..
```

## Run

```bash
python -m pipeline check-network   # one probe per configured host
python -m pipeline all             # fetch -> build -> stats, then copy outputs to web/public/data
cd web && npm run dev              # or: npm run build  -> static site in web/dist
```

Steps can also be run one at a time: `fetch`, `build`, `stats` (add `--web` to copy outputs to the
web app). Raw API responses are cached in `data/raw/`; use `--refresh` to refetch.
`--area config/area.<city>.yaml` selects another area.

Outputs go to `data/processed/`: `boundary.geojson`, `borings.geojson` / `.parquet`,
`reports.geojson`, `gaps.geojson`, `stats.json`, `coverage_curve.png`, `manifest.json`, `profile.md`.

## Publishing (GitHub Pages)

`.github/workflows/pages.yml` builds `web/` and deploys it to GitHub Pages on every push to `main`
that touches `web/` or `data/processed/` (or run it by hand from the Actions tab). CI doesn't run
the Python pipeline, because FDOT and Geosetta inputs are browser-saved files. The site shows the
outputs committed in `data/processed/`. To update the site:

```bash
python -m pipeline build && python -m pipeline stats --web
git add data/processed && git commit -m "Update map data" && git push
```

One-time setup: in the repo, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site is served at `https://<owner>.github.io/<repo>/` (Vite builds with relative paths, so
any subpath works). `npm run dev`/`build` copy `data/processed/` into `web/public/data`
automatically (`npm run sync-data`).

## Tests

```bash
pytest            # offline; uses recorded fixtures in tests/fixtures
ruff check .
cd web && npm test   # NN correctness + performance, and web-vs-Python stats consistency (±0.5 pp)
```

## Network domains

| Host | Needed for | Status from this build's sandbox (2026-11-15) |
|---|---|---|
| `tigerweb.geo.census.gov` | city boundary | reachable |
| `gis.fdot.gov` | FDOT soil borings (**primary source**) | **blocked by FDOT's Azure WAF** (HTTP 403 block page; not the sandbox allowlist) |
| `ca.dep.state.fl.us` | FGS wells, FDEP cleanup sites | reachable |
| `permitting.sjrwmd.com` | SJRWMD well records, ERP permit areas | reachable |
| `waterservices.usgs.gov` | USGS NWIS groundwater sites | reachable |
| `tiles.openfreemap.org` | basemap | reachable |
| `doi.org`, `www.sciencebase.gov` | USGS CPT release (open question 6) | reachable; release has no Florida points |
| `services1.arcgis.com` | FDOT's ArcGIS Online org (`O1JpcwDW8sjYuddV`) | reachable; its 1,605 hosted services include **no soil-boring layer**, so it's not an FDOT mirror |
| `geodes.kyrasolutions.com` | FGS well report links (links only; not fetched) | not needed |

### FDOT access workaround

`gis.fdot.gov` rejects scripted clients (curl/requests get an Azure WAF 403 even from a home
connection) but works in a web browser. Run `python -m pipeline manual-urls`, open the printed
URLs in a browser, and save the responses into `data/manual/fdot_d2/` (details in
[that folder's README](data/manual/fdot_d2/README.md)). `build` re-reads the folder every time
and records the import in `manifest.json`. Saved `.json` feature pages there are used instead of
the network, and `attachments.json` gives every boring a direct link to its public log PDF.

### Geosetta (no API key needed for this route)

Draw an area on geosetta.org's map, export the DIGGS viewer page, and save the `.html` (or raw
DIGGS `.xml`) into `data/manual/geosetta/`. `build` re-reads that folder. Boreholes that match an
FDOT boring within 5 m add their depth, SPT N-values and soil layers to it; the rest become
tier-4 borings flagged `approx_location` when Geosetta placed them at a report site.

## Licensing

Each source has a license tier (SPEC §8), recorded in `manifest.json` and shown in the map's About
panel. Reports written by private consultants may still carry the consultant's copyright. This is
not legal advice. **The map is not for design use; locations are approximate.**
