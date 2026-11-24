import maplibregl, { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { cellToBoundary } from "h3-js";
import { areaPseudoPoints } from "./areas";
import { decodeState, encodeState, ViewState } from "./urlstate";
import {
  applyFilters, Boring, coverageCurve, Filters, findGaps, Grid, makeGrid, median,
  nearestDistances, reportCounts,
} from "./coverage";

type FC = GeoJSON.FeatureCollection;
interface SourceEntry {
  name?: string; url?: string; homepage?: string; tier: number; kind: string; license?: string;
  disclaimer?: string; status: string; reason?: string; fetched?: string; n_raw?: number;
  n_in_area?: number; n_after_dedupe?: number; default_on?: boolean; doc_label?: string;
  rights?: string; rights_detail?: string;
  about?: { origin?: string; contents?: string; design_use?: string; limits?: string };
}
interface ModelGridEntry {
  status: string; n_cells: number; n_features: number; h3_resolution: number; depth_ft: number; built?: string;
  disclaimer?: string; predictions?: { status: string; n: number; reason?: string };
  site_class?: { status: string; n: number; reason?: string }; site_report?: { status: string; n: number; reason?: string };
  about?: { origin?: string; contents?: string; design_use?: string; limits?: string };
}
interface Manifest {
  area: string; generated: string; built?: string; basemap_style?: string;
  boundary: { url: string; license?: string; fetched?: string };
  sources: Record<string, SourceEntry>;
  model_grid?: ModelGridEntry;
}
interface Stats {
  area_id: string; h3_resolution: number; radii_m: number[]; default_radius_m: number;
  pct_covered: Record<string, number>;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DATA = "./data/";
const TYPES = ["SPT", "CPT", "Auger", "Well", "Other", "Document", "Site", "Permit"];
const TYPE_LABEL: Record<string, string> = { Site: "Cleanup site (FDEP)", Permit: "Permit area (ERP)", Document: "Report document (location)" };
const TYPE_COLOR: Record<string, string> = {
  SPT: "#2a78d6", CPT: "#eb6834", Auger: "#1baf7a", Well: "#52514e", Other: "#a3a29c", Document: "#b8336a", Site: "#c98500", Permit: "#008300",
};
// Drawn and labelled, never counted toward coverage (pipeline: normalize.NO_COVERAGE_FLAG)
const counts = (b: Boring) => !String(b.flags ?? "").split(",").includes("not_site_data");

// Geosetta model grid (pipeline/model_grid.py): one variable at a time colours the cells.
interface ModelVar { label: string; short: string; bins?: number[]; binLabels?: string[]; cats?: [string | number, string][]; none?: string; palette: string[] }
const SEQ = ["#7a2a04", "#b2420a", "#e0651f", "#f39a4d", "#f9c890", "#fde9cf"]; // shallow/low = dark
const CAT = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#999999"]; // Okabe-Ito
const DEPTH_BINS = [3, 6, 10, 20, 35];
const DEPTH_LABELS = ["0–3 ft", "3–6 ft", "6–10 ft", "10–20 ft", "20–35 ft", "35–50 ft"];
const MODEL_VARS: Record<string, ModelVar> = {
  depth_fines_ft: { label: "Depth to first clay or silt layer", short: "clay/silt", bins: DEPTH_BINS, binLabels: DEPTH_LABELS, none: "none predicted to 50 ft", palette: SEQ },
  depth_n10_ft: { label: "Depth to SPT N ≥ 10 (medium dense / stiff)", short: "N ≥ 10", bins: DEPTH_BINS, binLabels: DEPTH_LABELS, none: "not reached by 50 ft", palette: SEQ },
  depth_rock_ft: { label: "Depth to rock (limestone)", short: "rock", bins: DEPTH_BINS, binLabels: DEPTH_LABELS, none: "no rock predicted to 50 ft", palette: SEQ },
  gw_category: { label: "Groundwater depth", short: "groundwater", cats: [[0, "Shallow (≤ 10 ft)"], [1, "Medium (10–50 ft)"], [2, "Deep (> 50 ft)"]], palette: ["#0b4f8a", "#56b4e9", "#d9ecf8"] },
  // ordered stiff (blue) to soft (brown); categories filled from the data
  site_class: { label: "Seismic site class (ASCE 7-22)", short: "site class", cats: [], palette: ["#0b4f8a", "#3a7fc1", "#7fb8e0", "#f9c890", "#e0651f", "#b2420a", "#7a2a04"] },
  sinkhole_risk: { label: "Sinkhole risk (terrain analysis)", short: "sinkhole risk", cats: [["low", "Low"], ["moderate", "Moderate"], ["high", "High"]], palette: ["#f9c890", "#e0651f", "#7a2a04"] },
  confidence: { label: "Prediction confidence", short: "confidence", bins: [40, 50, 60, 70], binLabels: ["< 40%", "40–50%", "50–60%", "60–70%", "≥ 70%"], palette: ["#7a2a04", "#e0651f", "#f9c890", "#7fb8e0", "#0b4f8a"] },
};
function modelValue(v: ModelVar, p: Record<string, unknown>, key: string): { i: number; label: string } {
  const x = p[key];
  if (v.cats) {
    const i = v.cats.findIndex(([c]) => String(c) === String(x));
    return i < 0 ? { i: -1, label: x == null ? "no data" : String(x) } : { i, label: v.cats[i][1] };
  }
  if (x == null) return { i: v.none ? v.palette.length : -1, label: v.none ?? "no data" };
  const i = binOf(Number(x), v.bins!);
  return { i, label: v.binLabels![i] };
}
const NONE_COLOR = "#eeeeec";
const DIST_BINS = [50, 100, 250, 500, 1000];
const DIST_COLORS = ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#cde2fb"]; // near = dark
const DIST_LABELS = ["0–50 m", "50–100 m", "100–250 m", "250–500 m", "500–1000 m", "> 1000 m"];
const PRESETS = [50, 100, 250, 500, 1000];
const TIER_LABELS: Record<number, string> = {
  1: "Tier 1: US federal (public domain)", 2: "Tier 2: + Florida agency public record",
  3: "Tier 3: + open licence (attribution)", 4: "Tier 4: + terms of use / disclaimer",
};
// feature-state "c": distance bin 0-5
const HEX_COLOR = ["match", ["coalesce", ["feature-state", "c"], -1],
  ...DIST_COLORS.flatMap((col, i) => [i, col]), "#00000000"] as unknown as maplibregl.ExpressionSpecification;
const SPARK_R = Array.from({ length: 61 }, (_, i) => i * 25); // 0..1500 m

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtPct = (v: number) => (v >= 10 || v === 0 ? v.toFixed(1) : v.toFixed(2));
const fmtM = (v: number | null) => v == null || !isFinite(v) ? "–" : v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${Math.round(v)} m`;
const safeUrl = (u: unknown) => typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;

async function getJSON<T>(name: string): Promise<T> {
  const r = await fetch(DATA + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const [boundary, boringsFC, reportsFC, manifest, stats, areasFC, modelFC] = await Promise.all([
    getJSON<FC>("boundary.geojson"), getJSON<FC>("borings.geojson"), getJSON<FC>("reports.geojson"),
    getJSON<Manifest>("manifest.json"), getJSON<Stats>("stats.json"),
    getJSON<FC>("areas.geojson"),
    getJSON<FC>("model_grid.geojson").catch(() => ({ type: "FeatureCollection", features: [] }) as FC),
  ]);
  const hasModel = modelFC.features.length > 0;
  { // site class comes as a single class or a range ("D–DE"): legend categories from the data, in ASCE order
    const order = ["A", "B", "BC", "C", "CD", "D", "DE", "E", "F"];
    const rank = (x: string) => x.split("–").reduce((t, c) => t + Math.max(0, order.indexOf(c)), 0) / x.split("–").length;
    const vals = [...new Set(modelFC.features.map((f) => f.properties?.site_class).filter((x): x is string => typeof x === "string"))];
    MODEL_VARS.site_class.cats = vals.sort((a, b) => rank(a) - rank(b)).map((x) => [x, x]);
  }
  // Real borings are drawn and counted. Area sources (permit polygons) add pseudo-points at the
  // H3 cells they overlap; those feed the coverage maths only (same model as pipeline/areas.py).
  const realBorings: Boring[] = boringsFC.features.map((f) => f.properties as Boring);
  const pseudo = areaPseudoPoints(areasFC, stats.h3_resolution);
  const borings: Boring[] = realBorings.concat(pseudo);
  const isReal = (b: Boring) => !b.pseudo;
  const bgeom = boundary.features[0].geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const bprops = (boundary.features[0].properties ?? {}) as Record<string, string>;
  $("title").textContent = `Geotechnical coverage: ${bprops.BASENAME ?? stats.area_id}`;

  // Stats grid matches the Python resolution; very fine grids are drawn one level coarser.
  const grid = makeGrid(bgeom, stats.h3_resolution);
  const dgrid: Grid = grid.cells.length > 30000 ? makeGrid(bgeom, stats.h3_resolution - 1) : grid;
  const hexGeoms = dgrid.cells.map((c) => ({ type: "Polygon", coordinates: [cellToBoundary(c, true)] }) as GeoJSON.Polygon);

  // ---------------------------------------------------------------- state
  const years = realBorings.map((b) => b.year).concat(areasFC.features.map((f) => f.properties?.year))
    .filter((y): y is number => y != null);
  const y0 = years.length ? Math.min(...years) : 1900, y1 = years.length ? Math.max(...years) : new Date().getFullYear();
  const sources = Object.entries(manifest.sources);
  const state = {
    radius: stats.default_radius_m ?? 250,
    filters: {
      maxTier: 4,
      types: new Set(TYPES),
      sources: new Set(sources.filter(([, s]) => s.status === "ok" && s.default_on !== false).map(([id]) => id)),
      yearMin: y0, yearMax: y1, includeUndated: true,
    } as Filters,
    layers: { boundary: true, hexes: true, borings: true, reports: true, areas: true, gaps: true, model: false } as Record<string, boolean>,
    modelVar: "depth_fines_ft",
  };

  // ---------------------------------------------------------------- shareable URL state
  const LAYER_KEYS = Object.keys(state.layers);
  const sourceIds = sources.map(([id]) => id);
  const defaults: ViewState = { radius: state.radius, maxTier: 4, types: new Set(TYPES), sources: new Set(state.filters.sources),
    yearMin: y0, yearMax: y1, includeUndated: true, hiddenLayers: new Set(LAYER_KEYS.filter((k) => !state.layers[k])),
    modelVar: state.modelVar };
  const initial = decodeState(location.search, defaults, TYPES, sourceIds.filter((id) => manifest.sources[id].status === "ok"), LAYER_KEYS,
    Object.keys(MODEL_VARS));
  state.radius = initial.radius;
  Object.assign(state.filters, { maxTier: initial.maxTier, types: initial.types, sources: initial.sources,
    yearMin: Math.max(y0, initial.yearMin), yearMax: Math.min(y1, initial.yearMax), includeUndated: initial.includeUndated });
  for (const k of LAYER_KEYS) state.layers[k] = !initial.hiddenLayers.has(k);
  if (!hasModel) state.layers.model = false;
  state.modelVar = initial.modelVar ?? state.modelVar;
  let mapView = initial.map;   // only written once the view differs from the default fit
  let aboutOpen: string | undefined;
  function writeUrl() {
    const f = state.filters;
    const v: ViewState = { radius: state.radius, maxTier: f.maxTier, types: f.types, sources: f.sources, yearMin: f.yearMin,
      yearMax: f.yearMax, includeUndated: f.includeUndated, hiddenLayers: new Set(LAYER_KEYS.filter((k) => !state.layers[k])),
      modelVar: state.modelVar, map: mapView, about: aboutOpen };
    const q = encodeState(v, defaults, TYPES, sourceIds);
    const url = location.pathname + (q ? "?" + q : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(null, "", url);
  }

  // ---------------------------------------------------------------- map
  const map = new maplibregl.Map({
    container: "map",
    style: manifest.basemap_style || "https://tiles.openfreemap.org/styles/positron",
    attributionControl: { compact: matchMedia("(max-width: 760px)").matches, customAttribution: "Boundary: US Census TIGERweb · Borings: see About" },
  });
  (window as unknown as { __map: maplibregl.Map }).__map = map; // handle for headless screenshots/tests
  map.addControl(new maplibregl.NavigationControl(), "top-left");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  const bb = bbox(bgeom);
  if (mapView) map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom });
  else map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30, duration: 0 });
  map.on("moveend", (e) => {
    if (!(e as { originalEvent?: unknown }).originalEvent && !mapView) return; // ignore the initial fit
    const c = map.getCenter();
    mapView = { zoom: map.getZoom(), lat: c.lat, lng: c.lng };
    writeUrl();
  });

  let mapReady = false;
  const hexColor = new Int8Array(dgrid.cells.length).fill(-1);
  map.on("load", () => {
    mapReady = true;
    map.addSource("boundary", { type: "geojson", data: boundary });
    // hex geometry is static: sent to MapLibre once; colours change through feature-state
    map.addSource("hexes", { type: "geojson", data: { type: "FeatureCollection",
      features: hexGeoms.map((g, i) => ({ type: "Feature", id: i, geometry: g, properties: { i } })) } });
    map.addSource("reports", { type: "geojson", data: reportsFC });
    map.addSource("gaps", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("borings", { type: "geojson", data: { type: "FeatureCollection", features: [] },
      cluster: true, clusterMaxZoom: 12, clusterRadius: 40 });

    map.addLayer({ id: "hexes", type: "fill", source: "hexes",
      paint: { "fill-color": HEX_COLOR, "fill-outline-color": HEX_COLOR,
        "fill-opacity": ["case", ["<", ["coalesce", ["feature-state", "c"], -1], 0], 0, 0.55] } });
    map.addSource("model", { type: "geojson", data: modelFC });
    map.addLayer({ id: "model-fill", type: "fill", source: "model",
      paint: { "fill-color": ["coalesce", ["get", "_c"], "#00000000"], "fill-opacity": 0.72, "fill-outline-color": "#ffffff" } });
    map.addLayer({ id: "model-line", type: "line", source: "model",
      paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.9 } });
    paintModel();
    map.addSource("areas", { type: "geojson", data: areasFC });
    map.addLayer({ id: "areas-fill", type: "fill", source: "areas", filter: ["in", ["get", "area_uid"], ["literal", []]],
      paint: { "fill-color": "#008300", "fill-opacity": ["case", ["get", "counts_toward_coverage"], 0.14, 0.05] } });
    map.addLayer({ id: "areas-line", type: "line", source: "areas", filter: ["in", ["get", "area_uid"], ["literal", []]],
      paint: { "line-color": "#008300", "line-width": 1, "line-opacity": 0.8,
        "line-dasharray": ["case", ["get", "counts_toward_coverage"], ["literal", [1, 0]], ["literal", [3, 2]]] } });
    map.addLayer({ id: "reports-fill", type: "fill", source: "reports",
      paint: { "fill-color": "#6250d6", "fill-opacity": 0.12 } });
    map.addLayer({ id: "reports-line", type: "line", source: "reports",
      paint: { "line-color": "#6250d6", "line-width": 1, "line-opacity": 0.7 } });
    map.addLayer({ id: "gaps", type: "line", source: "gaps",
      paint: { "line-color": "#d03b3b", "line-width": 1.75, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "gaps-label", type: "symbol", source: "gaps",
      layout: { "text-field": ["concat", "Gap ", ["get", "rank"]], "text-size": 11, "text-font": ["Noto Sans Regular"] },
      paint: { "text-color": "#8a1f1f", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
    map.addLayer({ id: "boundary", type: "line", source: "boundary",
      paint: { "line-color": "#0b0b0b", "line-width": 1.5 } });
    map.addLayer({ id: "clusters", type: "circle", source: "borings", filter: ["has", "point_count"],
      paint: { "circle-color": "#52514e", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 12, 50, 16, 250, 21] } });
    map.addLayer({ id: "cluster-count", type: "symbol", source: "borings", filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
      paint: { "text-color": "#fff" } });
    const typeColor: maplibregl.ExpressionSpecification = ["match", ["get", "boring_type"],
      ...TYPES.flatMap((t) => [t, TYPE_COLOR[t]]), "#a3a29c"] as unknown as maplibregl.ExpressionSpecification;
    map.addLayer({ id: "borings", type: "circle", source: "borings", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 7],
        // tiers 1-2 solid; tiers 3-4 hollow (surface fill, coloured ring)
        "circle-color": ["case", ["<=", ["coalesce", ["get", "tier"], 4], 2], typeColor, "#ffffff"],
        "circle-stroke-color": ["case", ["<=", ["coalesce", ["get", "tier"], 4], 2], "#ffffff", typeColor],
        "circle-stroke-width": 2,
      } });

    for (const id of ["borings", "clusters", "reports-fill", "areas-fill", "model-fill", "hexes"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", onClick);
    recompute();
    applyLayerVisibility();
  });

  // ---------------------------------------------------------------- compute
  let last: { dist: Float64Array; ddist: Float64Array; filtered: Boring[]; counted: Boring[]; pct: number; curve: number[] } | null = null;
  let pending = 0;
  buildControls();

  function recompute() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const t0 = performance.now();
      const filtered = applyFilters(borings, state.filters);
      const counted = filtered.filter(counts);
      const dist = nearestDistances(grid, counted);
      const ddist = dgrid === grid ? dist : nearestDistances(dgrid, counted);
      const both = coverageCurve(dist, grid.area, [...SPARK_R, state.radius]);
      const curve = both.slice(0, SPARK_R.length), pct = both[SPARK_R.length];
      last = { dist, ddist, filtered, counted, pct, curve };
      writeUrl();
      const t1 = performance.now();
      updateMap();
      const t2 = performance.now();
      updateStats();
      console.debug(`recompute ${(performance.now() - t0).toFixed(0)} ms (compute ${(t1 - t0).toFixed(0)}, map ${(t2 - t1).toFixed(0)})`);
    });
  }

  function updateMap() {
    if (!last || !mapReady) return;
    const { ddist, filtered } = last;
    // colour index per hex = distance bin; only hexes whose bin changed are updated
    for (let i = 0; i < dgrid.cells.length; i++) {
      const c = binOf(ddist[i], DIST_BINS);
      if (hexColor[i] !== c) { hexColor[i] = c; map.setFeatureState({ source: "hexes", id: i }, { c }); }
    }
    (map.getSource("borings") as GeoJSONSource).setData({ type: "FeatureCollection",
      features: filtered.filter(isReal).map((b) => ({ type: "Feature", geometry: { type: "Point", coordinates: [b.lon, b.lat] }, properties: b })) });
    const visibleReports = new Set(filtered.map((b) => b.report_key).filter(Boolean));
    map.setFilter("reports-fill", ["in", ["get", "report_key"], ["literal", [...visibleReports]]]);
    map.setFilter("reports-line", ["in", ["get", "report_key"], ["literal", [...visibleReports]]]);
    // areas: visible when their source/tier/type/year pass the filters (big areas have no
    // pseudo-points, so test the area's own properties)
    const f = state.filters;
    const visibleAreas = areasFC.features.map((a) => a.properties as Record<string, unknown>).filter((a) =>
      f.sources.has(a.source_id as string) && (a.tier as number) <= f.maxTier && f.types.has(a.boring_type as string) &&
      (a.year == null ? f.includeUndated : (a.year as number) >= f.yearMin && (a.year as number) <= f.yearMax))
      .map((a) => a.area_uid as string);
    map.setFilter("areas-fill", ["in", ["get", "area_uid"], ["literal", visibleAreas]]);
    map.setFilter("areas-line", ["in", ["get", "area_uid"], ["literal", visibleAreas]]);
    const gaps = state.layers.gaps ? findGaps(dgrid, ddist, state.radius, 10) : [];
    (map.getSource("gaps") as GeoJSONSource).setData({ type: "FeatureCollection",
      features: gaps.map((g) => ({ type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: g.geometry.coordinates.map((poly) => [poly[0]]) } as GeoJSON.MultiPolygon, properties: { rank: g.rank, area_km2: g.areaKm2 } })) });
    renderLegend();
  }

  function updateStats() {
    if (!last) return;
    const { filtered, pct, dist, curve } = last;
    $("hero-pct").textContent = fmtPct(pct);
    $("hero-r").textContent = String(state.radius);
    $("st-borings").textContent = filtered.filter(isReal).length.toLocaleString();
    $("st-reports").textContent = new Set(filtered.map((b) => b.report_key).filter(Boolean)).size.toLocaleString();
    $("st-median").textContent = fmtM(median(dist));
    drawSpark(curve);
    const notice = $("notice");
    const failed = sources.filter(([, s]) => s.status !== "ok");
    const msgs: string[] = [];
    if (failed.length) msgs.push(`Unavailable: ${failed.map(([id, s]) => `${s.name ?? id} (${s.status})`).join(", ")}.`);
    if (!filtered.length) msgs.push("No borings match the current filters.");
    if (filtered.some((b) => b.kind === "permit_site"))
      msgs.push("Permit areas count toward coverage through the area they cover, not as borings; permits over 100 acres are drawn but not counted.");
    if (filtered.some((b) => b.kind === "environmental_site"))
      msgs.push("Cleanup sites are facilities, not borings: coverage with them on counts sites whose public files usually contain shallow boring logs.");
    // Disclaimers travel with the data: a source is "in use" when it is switched on or when its
    // parsed logs enrich borings from another source (e.g. Geosetta logs on FDOT borings).
    const inUse = new Set([...state.filters.sources, ...filtered.map((b) => b.log_from as string).filter(Boolean)]);
    const gs = sources.filter(([id, s]) => inUse.has(id) && s.disclaimer);
    for (const [, s] of gs) msgs.push(`${s.name ?? "Source"} data is shown with its disclaimer (see About): not for design; may contain transcription errors.`);
    if (filtered.some((b) => !counts(b))) msgs.push("Documents marked \"not site data\" (e.g. a journal paper pinned to a university) are drawn but don't count toward coverage.");
    if (state.layers.model && hasModel) msgs.push(`Geosetta model grid: machine-learning estimates, not measurements, shown with Geosetta's disclaimer (see About). They don't count toward coverage.`);
    notice.hidden = !msgs.length;
    notice.textContent = msgs.join(" ");
  }

  // ---------------------------------------------------------------- sparkline (with hover)
  function drawSpark(curve: number[]) {
    const svg = $("spark") as unknown as SVGSVGElement;
    const W = 260, H = 80, L = 24, B = 14, T = 4;
    const x = (r: number) => L + (r / 1500) * (W - L - 4);
    const y = (p: number) => T + (1 - p / 100) * (H - B - T);
    const path = curve.map((p, i) => `${i ? "L" : "M"}${x(SPARK_R[i]).toFixed(1)},${y(p).toFixed(1)}`).join("");
    const cur = coverageCurveAt(curve, state.radius);
    svg.innerHTML = `
      <line class="axis" x1="${L}" y1="${y(0)}" x2="${W - 4}" y2="${y(0)}"/>
      <line class="axis" x1="${L}" y1="${y(100)}" x2="${W - 4}" y2="${y(100)}" stroke-dasharray="2 3"/>
      <text class="axis-label" x="${L - 4}" y="${y(100) + 3}" text-anchor="end">100%</text>
      <text class="axis-label" x="${L - 4}" y="${y(0) + 3}" text-anchor="end">0</text>
      ${[0, 500, 1000, 1500].map((r) => `<text class="axis-label" x="${x(r)}" y="${H - 2}" text-anchor="middle">${r === 1500 ? "1.5 km" : r}</text>`).join("")}
      <line class="rline" x1="${x(state.radius)}" y1="${y(0)}" x2="${x(state.radius)}" y2="${y(100)}"/>
      <path class="line" d="${path}"/>
      <circle class="marker" cx="${x(state.radius)}" cy="${y(cur)}" r="4"/>
      <rect x="${L}" y="0" width="${W - L}" height="${H}" fill="transparent" id="spark-hit"/>`;
    const tip = $("spark-tip");
    const hit = svg.querySelector("#spark-hit")!;
    hit.addEventListener("mousemove", (e) => {
      const ev = e as MouseEvent, rect = svg.getBoundingClientRect();
      const rx = ((ev.clientX - rect.left) / rect.width) * W;
      const r = Math.max(0, Math.min(1500, Math.round(((rx - L) / (W - L - 4)) * 1500 / 25) * 25));
      tip.hidden = false;
      tip.textContent = `${r} m: ${fmtPct(coverageCurveAt(curve, r))}% covered`;
      tip.style.left = `${Math.min(rect.width - 120, Math.max(0, ev.clientX - rect.left - 50))}px`;
      tip.style.top = `-6px`;
    });
    hit.addEventListener("mouseleave", () => (tip.hidden = true));
  }
  function coverageCurveAt(curve: number[], r: number) {
    const i = r / 25, a = Math.floor(i), b = Math.min(curve.length - 1, a + 1);
    return curve[a] + (curve[b] - curve[a]) * (i - a);
  }

  // ---------------------------------------------------------------- model grid
  function paintModel() {
    if (!mapReady || !map.getSource("model")) return;
    const v = MODEL_VARS[state.modelVar];
    for (const f of modelFC.features) {
      const p = f.properties as Record<string, unknown>;
      const { i } = modelValue(v, p, state.modelVar);
      p._c = i < 0 ? null : i >= v.palette.length ? NONE_COLOR : v.palette[i];
    }
    (map.getSource("model") as GeoJSONSource).setData(modelFC);
  }
  function modelLegend(): string {
    if (!state.layers.model || !hasModel) return "";
    const v = MODEL_VARS[state.modelVar];
    const items: [string, string][] = v.cats ? v.cats.map(([, l], i) => [v.palette[i % v.palette.length], l])
      : v.binLabels!.map((l, i) => [v.palette[i], l]);
    if (v.none) items.push([NONE_COLOR, v.none]);
    const present = new Set(modelFC.features.map((f) => modelValue(v, f.properties as Record<string, unknown>, state.modelVar).label));
    return `<h3>Geosetta model: ${esc(v.label)}</h3>
      <div class="bins">${items.filter(([, l]) => !v.cats || present.has(l)).map(([c, l]) => `<span class="bin" style="background:${c}"></span><span>${esc(l)}</span>`).join("")}</div>
      <p class="muted small">Estimates at ${MODEL_GRID_NOTE()}, not measurements.</p>`;
  }
  const MODEL_GRID_NOTE = () => `${manifest.model_grid?.n_features ?? modelFC.features.length} grid points ~0.9 km apart`;

  // ---------------------------------------------------------------- legend
  function renderLegend() {
    const bins = DIST_LABELS.map((l, i) => [DIST_COLORS[i], l]);
    const typesShown = TYPES.filter((t) => state.filters.types.has(t));
    const open = (document.querySelector("#legend details") as HTMLDetailsElement | null)?.open ?? !matchMedia("(max-width: 760px)").matches;
    $("legend").innerHTML = `<details ${open ? "open" : ""}><summary>Legend</summary>
      <h3>Distance to nearest boring</h3>
      <div class="bins">${bins.map(([c, l]) => `<span class="bin" style="background:${c}"></span><span>${l}</span>`).join("")}</div>
      <h3>Borings</h3>
      <div class="bins">${typesShown.map((t) => `<span class="swatch" style="background:${TYPE_COLOR[t]}"></span><span>${TYPE_LABEL[t] ?? t}</span>`).join("")}
        <span class="swatch" style="border:2px solid #52514e"></span><span>Hollow: tier 3–4</span></div>
      <div class="bins"><span class="bin" style="background:#6250d633;border-color:#6250d6"></span><span>Report footprint</span>
        <span class="bin" style="border:2px dashed #d03b3b"></span><span>Largest gaps at R</span>
        ${state.filters.sources.has("sjrwmd_erp") ? `<span class="bin" style="background:#00830024;border-color:#008300"></span><span>Permit area (dashed: drawn only)</span>` : ""}</div>
      ${modelLegend()}</details>`;
  }

  // ---------------------------------------------------------------- popups
  function onClick(e: MapMouseEvent) {
    const order = ["clusters", "borings", "reports-fill", "areas-fill", "model-fill", "hexes"].filter((l) => state.layers[layerKey(l)]);
    const hits = map.queryRenderedFeatures(e.point, { layers: order });
    if (!hits.length) return;
    const f = hits.sort((a, b) => order.indexOf(a.layer.id) - order.indexOf(b.layer.id))[0];
    const p = f.properties as Record<string, unknown>;
    let html = "";
    if (f.layer.id === "clusters") {
      (map.getSource("borings") as GeoJSONSource).getClusterExpansionZoom(p.cluster_id as number).then((z) =>
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
      return;
    } else if (f.layer.id === "borings") {
      const src = manifest.sources[p.source_id as string];
      const url = safeUrl(p.doc_url);
      html = table((<[string, unknown][]>[
        [p.boring_type === "Site" ? "Site" : "Boring", p.boring_name], ["Type", TYPE_LABEL[p.boring_type as string] ?? p.boring_type], [p.boring_type === "Site" ? "Discharge date" : "Date", p.date ?? p.year ?? p.date_raw ?? "undated"],
        ["Source", src?.name ?? p.source_id], ["Tier", p.tier], ["Depth", p.depth_ft != null ? `${p.depth_ft} ft${p.log_from && p.log_from !== p.source_id ? " (from parsed log)" : ""}` : null],
        ["Elevation", p.elev], ["Water level", p.gw], ["FDOT project (FIN)", p.fin],
        [p.boring_type === "Document" ? "Document" : "Project", p.source_id !== "fdot_d2" ? p.doc_name : null],
        ["Location", String(p.flags ?? "").includes("approx_location") ? (p.location_precision === "site_level"
          ? "site-level (Geosetta): placed at the report's site, not where it was drilled" : "approximate: placed at a geocoded report site, may be far off") : null],
      ]).concat(detailRows(p.details).filter(([k, v]) => k !== "Location precision" && !(k === "Document" && v === p.doc_name)))) + logHtml(p.log, p.log_from) + docLine(url, p.doc_internal, src?.doc_label)
        + rightsHtml(p, src)
        + (!counts(p as unknown as Boring) ? `<p class="muted"><strong>Not site data:</strong> this document isn't about the place it's pinned to, so it doesn't count toward coverage.</p>` : "")
        + (p.boring_type === "Site" ? `<p class="muted">A cleanup site, not a boring: its public file usually holds site assessment reports with shallow soil-boring and monitoring-well logs. Point = facility location.</p>` : "")
        + (p.boring_type === "Document" ? `<p class="muted">A source document Geosetta found, with no parsed boring data. Geosetta only serves the file to API-key holders, so the link opens the location on Geosetta's map.</p>` : "");
    } else if (f.layer.id === "areas-fill") {
      const src = manifest.sources[p.source_id as string];
      const url = safeUrl(p.doc_url);
      html = table((<[string, unknown][]>[
        ["Permit area", p.name], ["Source", src?.name ?? p.source_id], ["Tier", p.tier],
        ["Decision date", p.date ?? p.year ?? "undated"], ["Mapped area", `${p.acres} acres`],
        ["Coverage", p.counts_toward_coverage ? "counts (cells it overlaps)" : `drawn only: larger than the ${100}-acre limit`],
      ]).concat(detailRows(p.details))) + docLine(url, null, src?.doc_label)
        + `<p class="muted">A permit site, not a boring: stormwater permit applications commonly include soil borings and seasonal high water table estimates.</p>`;
    } else if (f.layer.id === "reports-fill") {
      const src = manifest.sources[p.source_id as string];
      const url = safeUrl(p.doc_url);
      const dr = [p.date_min ?? p.year_min, p.date_max ?? p.year_max].filter(Boolean);
      html = table([
        ["Report", p.doc_name ?? p.report_key], ["Borings", p.n_borings], ["Types", p.types],
        ["Dates", dr.length ? [...new Set(dr)].join(" – ") : "undated"], ["Source", src?.name ?? p.source_id],
        ["FDOT project (FIN)", p.fin], ["Log sheets", p.n_documents],
        ["Span", p.flag_span ? `${fmtM(p.span_m as number)} (wide: corridor or key issue)` : null],
      ]) + docLine(url, p.doc_internal, src?.doc_label) + rightsHtml(p, src);
    } else if (f.layer.id === "model-fill") {
      html = modelPopup(p);
    } else if (f.layer.id === "hexes" && last) {
      const i = p.i as number;
      const rc = reportCounts(dgrid, last.counted, state.radius, [i])[i];
      html = table([["Distance to nearest boring", fmtM(last.ddist[i])], [`Reports within ${state.radius} m`, rc]]);
    }
    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
  }
  // What we may do with a record: the document's own label when known, else the source's.
  function rightsHtml(p: Record<string, unknown>, src?: SourceEntry): string {
    const label = (p.rights as string) ?? src?.rights;
    if (!label) return "";
    const detail = (p.rights_detail as string) ?? src?.rights_detail;
    const logSrc = p.log_from && p.log_from !== p.source_id ? manifest.sources[p.log_from as string] : undefined;
    const via = (p.rights_detail && src?.rights && src.rights !== p.rights ? `<br/><span class="muted">Data via ${esc(src.name)}: ${esc(src.rights)}</span>` : "")
      + (logSrc?.rights ? `<br/><span class="muted">Parsed log via ${esc(logSrc.name)}: ${esc(logSrc.rights)}</span>` : "");
    return `<div class="rights"><strong>Reuse:</strong> ${esc(label)}${detail ? `<details><summary>What this means</summary><p>${esc(detail)}</p></details>` : ""}${via}</div>`;
  }
  function modelPopup(p: Record<string, unknown>): string {
    const ft = (v: unknown, none: string) => v == null ? none : `${v} ft`;
    const json = <T,>(v: unknown): T | null => { try { return typeof v === "string" ? JSON.parse(v) as T : null; } catch { return null; } };
    const probs = json<Record<string, number>>(p.gw_probs);
    const vs = json<number[]>(p.vs30_range);
    const flags = json<string[]>(p.hazard_flags);
    const layers = json<[number, number, string | null, string | null, string | null][]>(p.layers) ?? [];
    const depth = manifest.model_grid?.depth_ft ?? 50;
    const t = table([
      ["Grid cell", p.address ?? `${Number(p.lat ?? 0).toFixed(4)}, ${Number(p.lon ?? 0).toFixed(4)}`],
      ["Ground elevation", p.elev_ft != null ? `${p.elev_ft} ft` : null],
      ["First clay or silt layer", p.layers != null ? ft(p.depth_fines_ft, `none predicted to ${depth} ft`) : null],
      ["SPT N ≥ 10 from", p.layers != null ? ft(p.depth_n10_ft, `not reached by ${depth} ft`) : null],
      ["Rock (limestone)", p.layers != null ? ft(p.depth_rock_ft, `none predicted to ${depth} ft`) : null],
      ["Groundwater", p.gw_label ? `${p.gw_label}${probs ? ` (${Object.entries(probs).map(([k, v]) => `${k} ${Math.round(v)}%`).join(", ")})` : ""}` : null],
      ["Confidence", p.confidence != null ? `${p.confidence}% (${p.confidence_level})` : null],
      ["Nearest training boring", p.nearest_trained_mi != null ? `${p.nearest_trained_mi} mi` : null],
      ["Geosetta borings within 500 m / 1 mi", p.borings_500m != null ? `${p.borings_500m} / ${p.borings_1mi}` : null],
      ["Seismic site class", p.site_class ? `${p.site_class} (ASCE 7-22)` : null],
      ["Vs30", p.vs30_ft_s ? `${Math.round(Number(p.vs30_ft_s))} ft/s${vs ? ` (${vs.map((x) => Math.round(x)).join("–")})` : ""}` : null],
      ["Geology", p.geology], ["Karst", p.karst == null ? null : p.karst ? (p.karst_type ?? "yes") : "no"],
      ["Sinkhole risk (terrain)", p.sinkhole_risk], ["Slope", p.slope_susceptibility],
      ["Terrain hazard", p.terrain_hazard ? `${p.terrain_hazard}${flags?.length ? ` (${flags.join(", ").replace(/_/g, " ")})` : ""}` : null],
      ["Mines within 2 mi", p.mines_2mi], ["Soil order", p.soil_order ? `${p.soil_order} (${p.soil_source ?? "SoilGrids"}, coarse)` : null],
    ]);
    const prof = layers.length ? `<details class="log"><summary>Predicted profile to ${depth} ft</summary><div class="log-body"><table>
      <tr><th>Depth</th><th>Soil</th><th class="num">N</th></tr>${layers.map(([a, b, sym, d, n]) =>
        `<tr><td>${a}–${b} ft</td><td>${sym ? `<strong>${esc(sym)}</strong> ` : ""}${esc(String(d ?? "").toLowerCase())}</td><td class="num">${esc(n ?? "")}</td></tr>`).join("")}</table></div></details>` : "";
    return `<p class="popup-title">Geosetta model estimate</p>${t}${prof}
      <p class="muted">Machine-learning predictions and GIS screening from Geosetta, not measurements. Doesn't count toward coverage.
      Shown under Geosetta's terms of use with its disclaimer (see About).</p>`;
  }
  const detailRows = (raw: unknown): [string, unknown][] => {
    if (typeof raw !== "string") return [];
    try { return Object.entries(JSON.parse(raw) as Record<string, unknown>); } catch { return []; }
  };
  const docLine = (url: string | null, internal: unknown, label?: string) => url
    ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">${
        label ? esc(label) + " ↗" : /\/attachments\/\d+$/.test(url) ? "Open boring log (PDF) ↗"
        : /\/attachments$/.test(url) ? "View attached documents ↗" : "Open document ↗"}</a></p>`
    : internal ? `<p class="muted">Document exists only on an internal agency network (not public). File: <code>${esc(String(internal).split(/[\\/]/).pop())}</code>. Request it as a public record.</p>` : "";
  function logHtml(raw: unknown, from: unknown): string {
    if (typeof raw !== "string") return "";
    let log: { n_values?: number[][]; lithology?: (number | string | null)[][]; provider?: string };
    try { log = JSON.parse(raw); } catch { return ""; }
    const src = manifest.sources[String(from)]?.name ?? String(from ?? "");
    const ft = (a: unknown, b: unknown) => `${a}–${b} ft`;
    const n = (log.n_values ?? []).map(([a, b, v]) => `<tr><td>${ft(a, b)}</td><td class="num">${esc(v)}</td></tr>`).join("");
    const l = (log.lithology ?? []).map(([a, b, sym, d]) =>
      `<tr><td>${ft(a, b)}</td><td>${sym ? `<strong>${esc(sym)}</strong> ` : ""}${esc(String(d ?? "").toLowerCase())}</td></tr>`).join("");
    if (!n && !l) return "";
    return `<details class="log" open><summary>Boring log <span class="muted">via ${esc(src)}${log.provider ? ` · ${esc(log.provider)}` : ""}</span></summary>
      <div class="log-body">${n ? `<table><tr><th>Depth</th><th class="num">SPT N</th></tr>${n}</table>` : ""}
      ${l ? `<table><tr><th>Depth</th><th>Soil</th></tr>${l}</table>` : ""}</div></details>`;
  }
  const table = (rows: [string, unknown][]) =>
    `<table>${rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  const layerKey = (id: string) => (id.startsWith("areas") ? "areas" : id.startsWith("report") ? "reports" : id.startsWith("model") ? "model" : id === "clusters" || id === "cluster-count" ? "borings" : id.startsWith("gaps") ? "gaps" : id);

  function applyLayerVisibility() {
    for (const id of ["boundary", "hexes", "model-fill", "model-line", "areas-fill", "areas-line", "reports-fill", "reports-line", "gaps", "gaps-label", "borings", "clusters", "cluster-count"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", state.layers[layerKey(id)] ? "visible" : "none");
    }
  }

  // ---------------------------------------------------------------- controls
  function buildControls() {
    const presets = $("radius-presets");
    const radius = $<HTMLInputElement>("radius");
    const setRadius = (r: number) => {
      state.radius = r; radius.value = String(r); $("radius-val").textContent = `${r} m`;
      presets.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.r) === r)));
      recompute();
    };
    presets.innerHTML = PRESETS.map((r) => `<button type="button" role="radio" data-r="${r}" aria-checked="false">${r >= 1000 ? r / 1000 + " km" : r + " m"}</button>`).join("");
    presets.addEventListener("click", (e) => { const r = (e.target as HTMLElement).dataset.r; if (r) setRadius(Number(r)); });
    radius.addEventListener("input", () => setRadius(Number(radius.value)));

    $("tiers").innerHTML = [1, 2, 3, 4].map((t) => `<label class="check"><input type="radio" name="tier" value="${t}" ${t === state.filters.maxTier ? "checked" : ""}/> ${TIER_LABELS[t]}</label>`).join("");
    $("tiers").addEventListener("change", (e) => { state.filters.maxTier = Number((e.target as HTMLInputElement).value); recompute(); });

    const tcount = (t: string) => t === "Permit" ? areasFC.features.length : realBorings.filter((b) => b.boring_type === t).length;
    $("types").innerHTML = TYPES.map((t) => `<label class="check"><input type="checkbox" value="${t}" ${state.filters.types.has(t) ? "checked" : ""}/> <span class="swatch" style="background:${TYPE_COLOR[t]}"></span>${TYPE_LABEL[t] ?? t} <span class="hint">${tcount(t)}</span></label>`).join("");
    $("types").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; i.checked ? state.filters.types.add(i.value) : state.filters.types.delete(i.value); recompute(); });

    $("sources").innerHTML = sources.map(([id, s]) => {
      const ok = s.status === "ok";
      const hint = ok ? `${s.n_after_dedupe ?? 0} · tier ${s.tier}${s.kind === "geologic_well" ? " · deep wells" : s.kind === "environmental_site" ? " · cleanup sites" : ""}` : `${s.status}: ${s.reason ?? ""}`;
      return `<div class="src-row"><label class="check ${ok ? "" : "disabled"}" title="${esc(s.reason ?? s.license ?? "")}"><input type="checkbox" value="${esc(id)}" ${state.filters.sources.has(id) ? "checked" : ""} ${ok ? "" : "disabled"}/> ${esc(s.name ?? id)} <span class="hint">${esc(hint.slice(0, 90))}</span></label>
        <button type="button" class="info" data-about="${esc(id)}" aria-label="About ${esc(s.name ?? id)}" title="About this source">i</button></div>`;
    }).join("");
    $("sources").addEventListener("click", (e) => {
      const id = (e.target as HTMLElement).dataset?.about;
      if (id) openAbout(id);
    });
    $("sources").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; i.checked ? state.filters.sources.add(i.value) : state.filters.sources.delete(i.value); recompute(); });

    const ymin = $<HTMLInputElement>("year-min"), ymax = $<HTMLInputElement>("year-max");
    for (const el of [ymin, ymax]) { el.min = String(y0); el.max = String(y1); el.step = "1"; }
    ymin.value = String(state.filters.yearMin); ymax.value = String(state.filters.yearMax);
    const syncYears = () => {
      let a = Number(ymin.value), b = Number(ymax.value);
      if (a > b) [a, b] = [b, a];
      state.filters.yearMin = a; state.filters.yearMax = b;
      $("year-min-val").textContent = String(a); $("year-max-val").textContent = String(b);
      recompute();
    };
    ymin.addEventListener("input", syncYears); ymax.addEventListener("input", syncYears);
    $("year-min-val").textContent = String(state.filters.yearMin); $("year-max-val").textContent = String(state.filters.yearMax);
    $<HTMLInputElement>("undated").checked = state.filters.includeUndated;
    $<HTMLInputElement>("undated").addEventListener("change", (e) => { state.filters.includeUndated = (e.target as HTMLInputElement).checked; recompute(); });


    const L: [string, string][] = [["hexes", "Coverage hexes"], ["borings", "Borings"], ["reports", "Report footprints"], ["areas", "Permit areas"], ["gaps", "Gaps"], ["boundary", "City boundary"]];
    if (hasModel) L.push(["model", "Geosetta model estimates"]);
    $("layers").innerHTML = L.map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" ${state.layers[k] ? "checked" : ""}/> ${l}${k === "model"
      ? ` <button type="button" class="info" data-about="geosetta_model" aria-label="About the Geosetta model estimates" title="About this layer">i</button>` : ""}</label>`).join("")
      + (hasModel ? `<label class="row model-var">Show <select id="model-var" aria-label="Model variable">${Object.entries(MODEL_VARS).map(([k, v]) =>
        `<option value="${k}" ${k === state.modelVar ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></label>` : "");
    $("layers").addEventListener("change", (e) => {
      const i = e.target as HTMLInputElement | HTMLSelectElement;
      if (i.id === "model-var") {
        state.modelVar = i.value; paintModel();
        if (!state.layers.model) { state.layers.model = true; ($("layers").querySelector('input[value="model"]') as HTMLInputElement).checked = true; applyLayerVisibility(); }
        renderLegend(); writeUrl(); return;
      }
      state.layers[i.value] = (i as HTMLInputElement).checked; applyLayerVisibility(); writeUrl(); renderLegend(); updateStats();
      if (i.value === "gaps" && (i as HTMLInputElement).checked) recompute();
    });
    $("layers").addEventListener("click", (e) => { const id = (e.target as HTMLElement).dataset?.about; if (id) { e.preventDefault(); openAbout(id); } });

    $("export-csv").addEventListener("click", exportCSV);
    $("export-geojson").addEventListener("click", () => {
      if (!last) return;
      download("borings_filtered.geojson", "application/geo+json", JSON.stringify({ type: "FeatureCollection",
        features: last.filtered.filter(isReal).map((b) => ({ type: "Feature", geometry: { type: "Point", coordinates: [b.lon, b.lat] }, properties: b })) }));
    });
    $("about-btn").addEventListener("click", () => openAbout());
    $("copy-link").addEventListener("click", async () => {
      writeUrl();
      const b = $("copy-link");
      try { await navigator.clipboard.writeText(location.href); b.textContent = "Link copied"; }
      catch { prompt("Copy this link:", location.href); }
      setTimeout(() => (b.textContent = "Copy link to this view"), 2000);
    });
    $<HTMLDialogElement>("about").addEventListener("close", () => { aboutOpen = undefined; writeUrl(); });
    setRadius(state.radius);
    if (initial.about) setTimeout(() => openAbout(initial.about === "guide" ? undefined : initial.about), 0);
    $("foot-sources").innerHTML = `Data built ${esc((manifest.built ?? manifest.generated).slice(0, 10))}. Basemap © OpenFreeMap, © OpenStreetMap contributors.`;
  }

  function exportCSV() {
    if (!last) return;
    const f = state.filters;
    const rows = [["metric", "value"],
      ["area_id", stats.area_id], ["h3_resolution", grid.resolution], ["n_cells", grid.cells.length],
      ["max_tier", f.maxTier], ["types", [...f.types].join(";")], ["sources", [...f.sources].join(";")],
      ["year_min", f.yearMin], ["year_max", f.yearMax], ["include_undated", f.includeUndated],
      ["n_borings", last.filtered.filter(isReal).length], ["n_reports", new Set(last.filtered.map((b) => b.report_key).filter(Boolean)).size],
      ["median_nearest_m", median(last.dist)?.toFixed(1) ?? ""],
      ...[...new Set([...stats.radii_m, state.radius])].sort((a, b) => a - b).map((r) =>
        [`pct_covered_${r}m`, coverageCurve(last!.dist, grid.area, [r])[0].toFixed(3)])];
    download("coverage_stats.csv", "text/csv", rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
  }

  function openAbout(focus?: string) {
    renderAbout(focus);
    const d = $<HTMLDialogElement>("about");
    if (!d.open) d.showModal();
    aboutOpen = focus ?? "guide";
    writeUrl();
  }

  function documentsTable(): string {
    const docs = new Map<string, Record<string, unknown>>();
    for (const b of realBorings) if (b.source_id === "geosetta" && b.doc_name && !docs.has(b.doc_name as string)) docs.set(b.doc_name as string, b);
    if (!docs.size) return "";
    const row = (b: Record<string, unknown>) => {
      const d = detailRows(b.details).reduce((o, [k, v]) => ({ ...o, [k]: v }), {} as Record<string, unknown>);
      return `<tr><td>${esc(b.doc_name)}${d["Author"] ? `<br/><span class="muted">${esc(d["Author"])}</span>` : ""}</td><td>${esc(d["Document type"] ?? "")}${counts(b as Boring) ? "" : "<br/><em>not site data</em>"}</td><td>${esc(b.rights)}</td></tr>`;
    };
    return `<h4>Documents behind Geosetta's non-DOT locations</h4><table class="guide"><tr><th>Document</th><th>Type</th><th>Reuse</th></tr>
      ${[...docs.values()].map(row).join("")}</table>`;
  }
  function modelCard(focus?: string): string {
    const m = manifest.model_grid;
    if (!m || !hasModel) return "";
    const a = m.about ?? {};
    const para = (t?: string) => (t ?? "").split(/\n+/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
    const prod = (k: "predictions" | "site_class" | "site_report", l: string) => m[k] ? `${l}: ${m[k]!.n}/${m.n_cells}${m[k]!.status !== "ok" ? ` (${esc(m[k]!.status)})` : ""}` : "";
    return `<details class="src-card" id="about-geosetta_model" ${focus === "geosetta_model" ? "open" : ""}>
      <summary><strong>Geosetta model estimates (grid layer)</strong> <span class="muted">${m.n_features} grid cells · tier 4 · off by default · built ${esc((m.built ?? "").slice(0, 10))}</span></summary>
      ${a.origin ? `<h4>Where we got it</h4>${para(a.origin)}` : ""}
      ${a.contents ? `<h4>What it contains</h4>${para(a.contents)}` : ""}
      ${a.design_use ? `<h4>Use for a first-pass design</h4>${para(a.design_use)}` : ""}
      ${a.limits ? `<h4>Limits</h4>${para(a.limits)}` : ""}
      <h4>What you may do with it</h4><p><strong>Geosetta terms of use — model output; share only with Geosetta's disclaimer</strong></p>
      <p class="muted">${[prod("predictions", "Predictions"), prod("site_class", "Site class"), prod("site_report", "Site reports")].filter(Boolean).join(" · ")}</p>
      ${m.disclaimer ? `<p class="muted"><strong>Disclaimer:</strong> ${esc(m.disclaimer)}</p>` : ""}
    </details>`;
  }

  function renderAbout(focus?: string) {
    const para = (t?: string) => (t ?? "").split(/\n+/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
    const count = (s: SourceEntry) => s.n_after_dedupe ?? s.n_in_area ?? s.n_raw;
    const cards = sources.map(([id, s]) => {
      const a = s.about ?? {};
      const links = [s.homepage && safeUrl(s.homepage) ? `<a href="${esc(s.homepage)}" target="_blank" rel="noopener">Publisher page</a>` : "",
        s.url && safeUrl(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Data service</a>` : ""].filter(Boolean).join(" · ");
      const status = s.status === "ok"
        ? `${count(s)?.toLocaleString() ?? "–"} records · tier ${s.tier} · ${s.default_on === false ? "off by default" : "on by default"} · updated ${esc((s.fetched ?? "").slice(0, 10))}`
        : `${esc(s.status)}: ${esc(s.reason ?? "")}`;
      return `<details class="src-card" id="about-${esc(id)}" ${focus === id ? "open" : ""}>
        <summary><strong>${esc(s.name ?? id)}</strong> <span class="muted">${status}</span></summary>
        ${a.origin ? `<h4>Where we got it</h4>${para(a.origin)}` : ""}
        ${a.contents ? `<h4>What it contains</h4>${para(a.contents)}` : ""}
        ${a.design_use ? `<h4>Use for a first-pass design</h4>${para(a.design_use)}` : ""}
        ${a.limits ? `<h4>Limits</h4>${para(a.limits)}` : ""}
        ${s.rights ? `<h4>What you may do with it</h4><p><strong>${esc(s.rights)}</strong></p>${para(s.rights_detail)}` : ""}
        ${id === "geosetta" ? documentsTable() : ""}
        <p class="muted">${esc(s.license ?? "")}${links ? ` · ${links}` : ""}</p>
        ${s.disclaimer ? `<p class="muted"><strong>Disclaimer:</strong> ${esc(s.disclaimer)}</p>` : ""}
      </details>`;
    }).join("") + modelCard(focus);
    $("about-body").innerHTML = `
      <p>This map shows where public subsurface information exists around ${esc(bprops.BASENAME ?? "the city")}, and how far any point is from it.
      The aim is a <strong>first pass at the soil parameters structural design needs</strong>, so you know what a site-specific geotechnical report is likely
      to recommend: suitable backfill, over-excavation of poor soils, or deep foundations such as piles. It never replaces that report.</p>
      <p class="warn-box"><strong>Not for design use.</strong> Locations are approximate, records may be incomplete or outdated, and conditions in
      karst terrain change over short distances.</p>

      <h3>What to look for, and where</h3>
      <table class="guide">
        <tr><th>Design question</th><th>What to look for</th><th>Best sources here</th></tr>
        <tr><td>Soil profile</td><td>Layer sequence and USCS/AASHTO classes in the upper 20–30 ft</td><td>FDOT boring logs, Geosetta parsed logs, geotech reports in recent ERP permits; FDEP site assessments for shallow layers</td></tr>
        <tr><td>Bearing and settlement</td><td>SPT N-values with depth (very loose/soft: N &lt; 4; loose: 4–10)</td><td>FDOT SPT logs, Geosetta N-values, ERP geotech reports</td></tr>
        <tr><td>Over-excavation</td><td>Clays (CL, CH; Hawthorn Group), organics (OL, PT, muck) or very loose sands near the surface</td><td>Geosetta soil layers, FDOT logs, ERP reports</td></tr>
        <tr><td>Backfill</td><td>Clean sands (SP, SP-SM; AASHTO A-3) suit compacted fill; clayey on-site soils (SC, CL, CH) usually don't</td><td>Same as soil profile</td></tr>
        <tr><td>Piles or ground improvement</td><td>Low N-values to depth, depth to limestone, voids or weathered rock (karst)</td><td>Deep FDOT SPT borings, FGS lithologic logs, SJRWMD casing depths (rough depth to rock)</td></tr>
        <tr><td>Groundwater (pools, excavations)</td><td>Seasonal high water table; for a pool, uplift and the need for hydrostatic relief</td><td>ERP geotech reports (seasonal high water), FDOT logs, SJRWMD static water levels, FDEP monitoring wells; USGS for the deep aquifer</td></tr>
      </table>
      <p class="muted">Coverage counts every source switched on under Sources: geotechnical borings, wells, cleanup sites and permit areas.
      They carry very different information (see each card below), so turn sources off to see, for example, where only SPT borings exist.
      Coverage is area-based on an H3 grid (resolution ${grid.resolution}, ${grid.cells.length.toLocaleString()} cells): the share of the city within R of the selected data.
      The current view, filters included, is saved in the page address, so it can be shared as a link.</p>

      <h3>Sources</h3>
      ${cards}
      <details class="src-card"><summary><strong>City boundary: US Census TIGERweb</strong> <span class="muted">tier 1</span></summary>
        <p>Incorporated place boundary (GEOID 1225175) from the Census Bureau's TIGERweb service, public domain. Used only to define the area being measured.</p>
        <p class="muted">${esc(manifest.boundary.url)}</p></details>
      <details class="src-card"><summary><strong>Checked, not used</strong></summary>
        <p>USGS CPT data release (doi:10.5066/P13M3WVY): 1,823 cone soundings in 14 states, none in Florida.
        FDOT's ArcGIS Online organisation: no soil-boring layer, and its project lines don't match the boring projects.
        Suwannee River WMD: no public well-permit layer found (the SJRWMD well layer covers all of Gainesville anyway).</p></details>

      <h3>License tiers (cumulative)</h3>
      <ol><li>US federal work (public domain).</li>
      <li>Florida agency public record. In <em>Microdecisions v. Skinner</em> (Fla. 2d DCA 2004) the court held an agency can't claim copyright in a public record without legislative authorization.</li>
      <li>Open licence that requires attribution (CC BY, OGL).</li><li>Accessible under terms of use or a disclaimer.</li></ol>
      <h3>Reuse labels</h3>
      <p>Every boring, report and document says what you may do with it ("Reuse" in its popup). The tier describes how we got the <em>data</em>;
      the reuse label also covers the <em>document</em>, which can differ: a consultant's report in an agency file is a public record you may inspect and copy,
      but the consultant may still own its copyright.</p>
      <table class="guide">
        <tr><th>Label</th><th>What you may do</th></tr>
        <tr><td>Public domain</td><td>Copy, republish and adapt freely (US federal works). Attribution is courteous.</td></tr>
        <tr><td>Public record — free to reuse</td><td>Florida agency records (state, county, city, water district, state university): copy and republish, citing the agency.</td></tr>
        <tr><td>Public record; consultant copyright</td><td>Inspect, copy for your own use, link and cite. Don't republish the document itself without the author's permission.</td></tr>
        <tr><td>Copyrighted — link and cite only</td><td>Private reports, journal papers, proposals. Link to and cite them; don't copy or re-host.</td></tr>
        <tr><td>Geosetta terms of use</td><td>Geosetta-compiled data (locations, parsed logs, model estimates) may be shared only with Geosetta's full disclaimer, without warranty; commercial API use needs Geosetta's data access fee. The documents behind it keep their own label.</td></tr>
      </table>
      <p>All reports are included whoever holds them, universities included; each carries its label. This map never re-hosts a document: it links to the publisher. This is not legal advice.</p>
      <p>Basemap: © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.</p>`;
    setTimeout(() => {
      const dlg = $<HTMLDialogElement>("about");
      if (focus) document.getElementById(`about-${focus}`)?.scrollIntoView({ block: "start" });
      else { dlg.scrollTop = 0; $("about-title").focus({ preventScroll: true }); }
    }, 0);
  }

}

function binOf(v: number, bins: number[]) { let i = 0; while (i < bins.length && v >= bins[i]) i++; return i; }
function bbox(g: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  for (const r of rings) for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
}
function download(name: string, type: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

main().catch((e) => {
  document.body.insertAdjacentHTML("afterbegin", `<p class="notice" role="alert">Failed to load data: ${String(e)}. Run <code>python -m pipeline all</code> first.</p>`);
  console.error(e);
});
