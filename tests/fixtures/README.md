# Test fixtures

- `fgs_wells_sample.records.json` — 20 real records recorded from the FGS Wells layer
  (ca.dep.state.fl.us) on 2026-11-15.
- `gainesville_boundary.geojson` — real TIGERweb boundary response (GEOID 1225175), 2026-11-15.
- `fdot_synthetic.records.json` — **SYNTHETIC**, FDOT-shaped records written by hand to the
  field list in SPEC §4.1. gis.fdot.gov blocked our requests, so we couldn't record real ones.
  Replace this file with a recorded sample once FDOT access works.
- `diggs_synthetic.html` — **SYNTHETIC**, a minimal DIGGS 3 document wrapped like Geosetta's
  viewer export (disclaimer comment + embedded XML): two co-located boreholes, SPT N-values,
  lithology.
