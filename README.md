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
| `ca.dep.state.fl.us` | FGS wells | reachable |
| `tiles.openfreemap.org` | basemap | reachable |
| `doi.org`, `www.sciencebase.gov` | USGS CPT release (open question 6) | reachable; release has no Florida points |
| `services1.arcgis.com` | FDOT's ArcGIS Online org (`O1JpcwDW8sjYuddV`) | reachable; its 1,605 hosted services include **no soil-boring layer**, so it's not an FDOT mirror |
| `geodes.kyrasolutions.com` | FGS well report links (links only; not fetched) | not needed |

### FDOT access workaround

`gis.fdot.gov` appears to reject requests from cloud/datacenter IPs. Run the fetch from a
normal network (your own machine); everything else works offline from the cache:

```bash
python -m pipeline fetch     # on a machine that can reach gis.fdot.gov
# then copy data/raw/ to the build environment and run:
python -m pipeline build && python -m pipeline stats --web
```

## Licensing

Each source has a license tier (SPEC §8), recorded in `manifest.json` and shown in the map's About
panel. Reports written by private consultants may still carry the consultant's copyright. This is
not legal advice. **The map is not for design use; locations are approximate.**
