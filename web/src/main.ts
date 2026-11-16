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
  about?: { origin?: string; contents?: string; design_use?: string; limits?: string };
}
interface Manifest {
  area: string; generated: string; built?: string; basemap_style?: string;
  boundary: { url: string; license?: string; fetched?: string };
  sources: Record<string, SourceEntry>;
}
interface Stats {
  area_id: string; h3_resolution: number; radii_m: number[]; default_radius_m: number;
  pct_covered: Record<string, number>;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DATA = "./data/";
const TYPES = ["SPT", "CPT", "Auger", "Well", "Other", "Site", "Permit"];
const TYPE_LABEL: Record<string, string> = { Site: "Cleanup site (FDEP)", Permit: "Permit area (ERP)" };
const TYPE_COLOR: Record<string, string> = {
  SPT: "#2a78d6", CPT: "#eb6834", Auger: "#1baf7a", Well: "#52514e", Other: "#a3a29c", Site: "#c98500", Permit: "#008300",
};
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
  const [boundary, boringsFC, reportsFC, manifest, stats, areasFC] = await Promise.all([
    getJSON<FC>("boundary.geojson"), getJSON<FC>("borings.geojson"), getJSON<FC>("reports.geojson"),
    getJSON<Manifest>("manifest.json"), getJSON<Stats>("stats.json"),
    getJSON<FC>("areas.geojson"),
  ]);
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
    layers: { boundary: true, hexes: true, borings: true, reports: true, areas: true, gaps: true } as Record<string, boolean>,
  };

  // ---------------------------------------------------------------- shareable URL state
  const LAYER_KEYS = Object.keys(state.layers);
  const sourceIds = sources.map(([id]) => id);
  const defaults: ViewState = { radius: state.radius, maxTier: 4, types: new Set(TYPES), sources: new Set(state.filters.sources),
    yearMin: y0, yearMax: y1, includeUndated: true, hiddenLayers: new Set() };
  const initial = decodeState(location.search, defaults, TYPES, sourceIds.filter((id) => manifest.sources[id].status === "ok"), LAYER_KEYS);
  state.radius = initial.radius;
  Object.assign(state.filters, { maxTier: initial.maxTier, types: initial.types, sources: initial.sources,
    yearMin: Math.max(y0, initial.yearMin), yearMax: Math.min(y1, initial.yearMax), includeUndated: initial.includeUndated });
  for (const k of initial.hiddenLayers) state.layers[k] = false;
  let mapView = initial.map;   // only written once the view differs from the default fit
  let aboutOpen: string | undefined;
  function writeUrl() {
    const f = state.filters;
    const v: ViewState = { radius: state.radius, maxTier: f.maxTier, types: f.types, sources: f.sources, yearMin: f.yearMin,
      yearMax: f.yearMax, includeUndated: f.includeUndated, hiddenLayers: new Set(LAYER_KEYS.filter((k) => !state.layers[k])),
      map: mapView, about: aboutOpen };
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

    for (const id of ["borings", "clusters", "reports-fill", "areas-fill", "hexes"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", onClick);
    recompute();
    applyLayerVisibility();
  });

  // ---------------------------------------------------------------- compute
  let last: { dist: Float64Array; ddist: Float64Array; filtered: Boring[]; pct: number; curve: number[] } | null = null;
  let pending = 0;
  buildControls();

  function recompute() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const t0 = performance.now();
      const filtered = applyFilters(borings, state.filters);
      const dist = nearestDistances(grid, filtered);
      const ddist = dgrid === grid ? dist : nearestDistances(dgrid, filtered);
      const both = coverageCurve(dist, grid.area, [...SPARK_R, state.radius]);
      const curve = both.slice(0, SPARK_R.length), pct = both[SPARK_R.length];
      last = { dist, ddist, filtered, pct, curve };
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
        ${state.filters.sources.has("sjrwmd_erp") ? `<span class="bin" style="background:#00830024;border-color:#008300"></span><span>Permit area (dashed: drawn only)</span>` : ""}</div></details>`;
  }

  // ---------------------------------------------------------------- popups
  function onClick(e: MapMouseEvent) {
    const order = ["clusters", "borings", "reports-fill", "areas-fill", "hexes"].filter((l) => state.layers[layerKey(l)]);
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
        ["Project", p.source_id !== "fdot_d2" ? p.doc_name : null],
        ["Location", String(p.flags ?? "").includes("approx_location") ? "approximate: placed at a geocoded report site, may be far off" : null],
      ]).concat(detailRows(p.details))) + logHtml(p.log, p.log_from) + docLine(url, p.doc_internal, src?.doc_label)
        + (p.boring_type === "Site" ? `<p class="muted">A cleanup site, not a boring: its public file usually holds site assessment reports with shallow soil-boring and monitoring-well logs. Point = facility location.</p>` : "");
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
        ["Licence", src?.license], ["Span", p.flag_span ? `${fmtM(p.span_m as number)} (wide: corridor or key issue)` : null],
      ]) + docLine(url, p.doc_internal, src?.doc_label);
    } else if (f.layer.id === "hexes" && last) {
      const i = p.i as number;
      const rc = reportCounts(dgrid, last.filtered, state.radius, [i])[i];
      html = table([["Distance to nearest boring", fmtM(last.ddist[i])], [`Reports within ${state.radius} m`, rc]]);
    }
    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
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
  const layerKey = (id: string) => (id.startsWith("areas") ? "areas" : id.startsWith("report") ? "reports" : id === "clusters" || id === "cluster-count" ? "borings" : id.startsWith("gaps") ? "gaps" : id);

  function applyLayerVisibility() {
    for (const id of ["boundary", "hexes", "areas-fill", "areas-line", "reports-fill", "reports-line", "gaps", "gaps-label", "borings", "clusters", "cluster-count"]) {
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
    $("layers").innerHTML = L.map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" ${state.layers[k] ? "checked" : ""}/> ${l}</label>`).join("");
    $("layers").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; state.layers[i.value] = i.checked; applyLayerVisibility(); writeUrl(); if (i.value === "gaps" && i.checked) recompute(); });

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
        <p class="muted">${esc(s.license ?? "")}${links ? ` · ${links}` : ""}</p>
        ${s.disclaimer ? `<p class="muted"><strong>Disclaimer:</strong> ${esc(s.disclaimer)}</p>` : ""}
      </details>`;
    }).join("");
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
      <p>Reports written by private consultants and hosted by an agency may still carry the consultant's copyright. University-held reports are excluded. This is not legal advice.</p>
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
