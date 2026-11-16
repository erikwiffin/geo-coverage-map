import maplibregl, { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { cellToBoundary } from "h3-js";
import {
  applyFilters, Boring, coverageCurve, Filters, findGaps, Grid, makeGrid, median,
  nearestDistances, reportCounts,
} from "./coverage";

type FC = GeoJSON.FeatureCollection;
interface SourceEntry {
  name?: string; url?: string; homepage?: string; tier: number; kind: string; license?: string;
  disclaimer?: string; status: string; reason?: string; fetched?: string; n_raw?: number;
  n_in_area?: number; n_after_dedupe?: number; default_on?: boolean;
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
const TYPES = ["SPT", "CPT", "Auger", "Well", "Other"];
const TYPE_COLOR: Record<string, string> = {
  SPT: "#2a78d6", CPT: "#eb6834", Auger: "#1baf7a", Well: "#52514e", Other: "#a3a29c",
};
const DIST_BINS = [50, 100, 250, 500, 1000];
const DIST_COLORS = ["#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#cde2fb"]; // near = dark
const DIST_LABELS = ["0–50 m", "50–100 m", "100–250 m", "250–500 m", "500–1000 m", "> 1000 m"];
const RC_BINS = [1, 2, 4, 8, 16];
const RC_COLORS = ["#cde2fb", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"]; // more = dark
const RC_LABELS = ["0", "1", "2–3", "4–7", "8–15", "16+"];
const PRESETS = [50, 100, 250, 500, 1000];
const TIER_LABELS: Record<number, string> = {
  1: "Tier 1: US federal (public domain)", 2: "Tier 2: + Florida agency public record",
  3: "Tier 3: + open licence (attribution)", 4: "Tier 4: + terms of use / disclaimer",
};
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
  const [boundary, boringsFC, reportsFC, manifest, stats] = await Promise.all([
    getJSON<FC>("boundary.geojson"), getJSON<FC>("borings.geojson"), getJSON<FC>("reports.geojson"),
    getJSON<Manifest>("manifest.json"), getJSON<Stats>("stats.json"),
  ]);
  const borings: Boring[] = boringsFC.features.map((f) => f.properties as Boring);
  const bgeom = boundary.features[0].geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const bprops = (boundary.features[0].properties ?? {}) as Record<string, string>;
  $("title").textContent = `Geotechnical coverage: ${bprops.BASENAME ?? stats.area_id}`;

  // Stats grid matches the Python resolution; very fine grids are drawn one level coarser.
  const grid = makeGrid(bgeom, stats.h3_resolution);
  const dgrid: Grid = grid.cells.length > 30000 ? makeGrid(bgeom, stats.h3_resolution - 1) : grid;
  const hexGeoms = dgrid.cells.map((c) => ({ type: "Polygon", coordinates: [cellToBoundary(c, true)] }) as GeoJSON.Polygon);

  // ---------------------------------------------------------------- state
  const years = borings.map((b) => b.year).filter((y): y is number => y != null);
  const y0 = years.length ? Math.min(...years) : 1900, y1 = years.length ? Math.max(...years) : new Date().getFullYear();
  const sources = Object.entries(manifest.sources);
  const state = {
    radius: stats.default_radius_m ?? 250,
    colorBy: "distance" as "distance" | "reports",
    filters: {
      maxTier: 4,
      types: new Set(TYPES),
      sources: new Set(sources.filter(([, s]) => s.status === "ok" && s.default_on !== false).map(([id]) => id)),
      yearMin: y0, yearMax: y1, includeUndated: true,
    } as Filters,
    layers: { boundary: true, hexes: true, borings: true, reports: true, gaps: true } as Record<string, boolean>,
  };

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
  map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 30, duration: 0 });

  let mapReady = false;
  map.on("load", () => {
    mapReady = true;
    map.addSource("boundary", { type: "geojson", data: boundary });
    map.addSource("hexes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("reports", { type: "geojson", data: reportsFC });
    map.addSource("gaps", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("borings", { type: "geojson", data: { type: "FeatureCollection", features: [] },
      cluster: true, clusterMaxZoom: 12, clusterRadius: 40 });

    map.addLayer({ id: "hexes", type: "fill", source: "hexes",
      paint: { "fill-color": ["get", "color"], "fill-outline-color": ["get", "color"], "fill-opacity": 0.55 } });
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

    for (const id of ["borings", "clusters", "reports-fill", "hexes"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", onClick);
    recompute();
    applyLayerVisibility();
  });

  // ---------------------------------------------------------------- compute
  let last: { dist: Float64Array; ddist: Float64Array; drc: Uint16Array; filtered: Boring[]; pct: number; curve: number[] } | null = null;
  let pending = 0;
  buildControls();

  function recompute() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const t0 = performance.now();
      const filtered = applyFilters(borings, state.filters);
      const dist = nearestDistances(grid, filtered);
      const ddist = dgrid === grid ? dist : nearestDistances(dgrid, filtered);
      const drc = state.colorBy === "reports" || state.layers.hexes ? reportCounts(dgrid, filtered, state.radius) : new Uint16Array(dgrid.cells.length);
      const curve = coverageCurve(dist, grid.area, SPARK_R);
      const pct = coverageCurve(dist, grid.area, [state.radius])[0];
      last = { dist, ddist, drc, filtered, pct, curve };
      updateMap();
      updateStats();
      console.debug(`recompute ${(performance.now() - t0).toFixed(0)} ms`);
    });
  }

  function updateMap() {
    if (!last || !mapReady) return;
    const { ddist, drc, filtered } = last;
    const feats: GeoJSON.Feature[] = new Array(dgrid.cells.length);
    for (let i = 0; i < dgrid.cells.length; i++) {
      const d = ddist[i];
      const color = state.colorBy === "distance" ? DIST_COLORS[binOf(d, DIST_BINS)] : RC_COLORS[binOf(drc[i], RC_BINS)];
      feats[i] = { type: "Feature", id: i, geometry: hexGeoms[i], properties: { i, color } };
    }
    (map.getSource("hexes") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    (map.getSource("borings") as GeoJSONSource).setData({ type: "FeatureCollection",
      features: filtered.map((b) => ({ type: "Feature", geometry: { type: "Point", coordinates: [b.lon, b.lat] }, properties: b })) });
    const visibleReports = new Set(filtered.map((b) => b.report_key).filter(Boolean));
    map.setFilter("reports-fill", ["in", ["get", "report_key"], ["literal", [...visibleReports]]]);
    map.setFilter("reports-line", ["in", ["get", "report_key"], ["literal", [...visibleReports]]]);
    const gaps = findGaps(dgrid, ddist, state.radius, 10);
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
    $("st-borings").textContent = filtered.length.toLocaleString();
    $("st-reports").textContent = new Set(filtered.map((b) => b.report_key).filter(Boolean)).size.toLocaleString();
    $("st-median").textContent = fmtM(median(dist));
    drawSpark(curve);
    const notice = $("notice");
    const failed = sources.filter(([, s]) => s.status !== "ok");
    const msgs: string[] = [];
    if (failed.length) msgs.push(`Unavailable: ${failed.map(([id, s]) => `${s.name ?? id} (${s.status})`).join(", ")}.`);
    if (!filtered.length) msgs.push("No borings match the current filters.");
    const gs = sources.filter(([id, s]) => state.filters.sources.has(id) && s.disclaimer);
    for (const [, s] of gs) msgs.push(s.disclaimer!);
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
    const bins = state.colorBy === "distance"
      ? DIST_LABELS.map((l, i) => [DIST_COLORS[i], l]) : RC_LABELS.map((l, i) => [RC_COLORS[i], l]);
    const typesShown = TYPES.filter((t) => state.filters.types.has(t));
    const open = (document.querySelector("#legend details") as HTMLDetailsElement | null)?.open ?? !matchMedia("(max-width: 760px)").matches;
    $("legend").innerHTML = `<details ${open ? "open" : ""}><summary>Legend</summary>
      <h3>${state.colorBy === "distance" ? "Distance to nearest boring" : `Reports within ${state.radius} m`}</h3>
      <div class="bins">${bins.map(([c, l]) => `<span class="bin" style="background:${c}"></span><span>${l}</span>`).join("")}</div>
      <h3>Borings</h3>
      <div class="bins">${typesShown.map((t) => `<span class="swatch" style="background:${TYPE_COLOR[t]}"></span><span>${t}</span>`).join("")}
        <span class="swatch" style="border:2px solid #52514e"></span><span>Hollow: tier 3–4</span></div>
      <div class="bins"><span class="bin" style="background:#6250d633;border-color:#6250d6"></span><span>Report footprint</span>
        <span class="bin" style="border:2px dashed #d03b3b"></span><span>Largest gaps at R</span></div></details>`;
  }

  // ---------------------------------------------------------------- popups
  function onClick(e: MapMouseEvent) {
    const order = ["clusters", "borings", "reports-fill", "hexes"].filter((l) => state.layers[layerKey(l)]);
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
      html = table([
        ["Boring", p.boring_name], ["Type", p.boring_type], ["Date", p.date ?? p.year ?? p.date_raw ?? "undated"],
        ["Source", src?.name ?? p.source_id], ["Tier", p.tier], ["Depth", p.depth_ft != null ? `${p.depth_ft} ft` : null],
        ["Elevation", p.elev], ["Water level", p.gw], ["FDOT project (FIN)", p.fin],
      ]) + docLine(url, p.doc_internal);
    } else if (f.layer.id === "reports-fill") {
      const src = manifest.sources[p.source_id as string];
      const url = safeUrl(p.doc_url);
      const dr = [p.date_min ?? p.year_min, p.date_max ?? p.year_max].filter(Boolean);
      html = table([
        ["Report", p.doc_name ?? p.report_key], ["Borings", p.n_borings], ["Types", p.types],
        ["Dates", dr.length ? [...new Set(dr)].join(" – ") : "undated"], ["Source", src?.name ?? p.source_id],
        ["FDOT project (FIN)", p.fin], ["Log sheets", p.n_documents],
        ["Licence", src?.license], ["Span", p.flag_span ? `${fmtM(p.span_m as number)} (wide: corridor or key issue)` : null],
      ]) + docLine(url, p.doc_internal);
    } else if (f.layer.id === "hexes" && last) {
      const i = p.i as number;
      html = table([["Distance to nearest boring", fmtM(last.ddist[i])], [`Reports within ${state.radius} m`, last.drc[i]]]);
    }
    new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
  }
  const docLine = (url: string | null, internal: unknown) => url
    ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Open document ↗</a></p>`
    : internal ? `<p class="muted">Document exists only on an internal agency network (not public). File: <code>${esc(String(internal).split(/[\\/]/).pop())}</code>. Request it as a public record.</p>` : "";
  const table = (rows: [string, unknown][]) =>
    `<table>${rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  const layerKey = (id: string) => (id.startsWith("report") ? "reports" : id === "clusters" || id === "cluster-count" ? "borings" : id.startsWith("gaps") ? "gaps" : id);

  function applyLayerVisibility() {
    for (const id of ["boundary", "hexes", "reports-fill", "reports-line", "gaps", "gaps-label", "borings", "clusters", "cluster-count"]) {
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

    $("tiers").innerHTML = [1, 2, 3, 4].map((t) => `<label class="check"><input type="radio" name="tier" value="${t}" ${t === 4 ? "checked" : ""}/> ${TIER_LABELS[t]}</label>`).join("");
    $("tiers").addEventListener("change", (e) => { state.filters.maxTier = Number((e.target as HTMLInputElement).value); recompute(); });

    const tcount = (t: string) => borings.filter((b) => b.boring_type === t).length;
    $("types").innerHTML = TYPES.map((t) => `<label class="check"><input type="checkbox" value="${t}" checked/> <span class="swatch" style="background:${TYPE_COLOR[t]}"></span>${t} <span class="hint">${tcount(t)}</span></label>`).join("");
    $("types").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; i.checked ? state.filters.types.add(i.value) : state.filters.types.delete(i.value); recompute(); });

    $("sources").innerHTML = sources.map(([id, s]) => {
      const ok = s.status === "ok";
      const hint = ok ? `${s.n_after_dedupe ?? 0} · tier ${s.tier}${s.kind === "geologic_well" ? " · deep wells" : ""}` : `${s.status}: ${s.reason ?? ""}`;
      return `<label class="check ${ok ? "" : "disabled"}" title="${esc(s.reason ?? s.license ?? "")}"><input type="checkbox" value="${esc(id)}" ${state.filters.sources.has(id) ? "checked" : ""} ${ok ? "" : "disabled"}/> ${esc(s.name ?? id)} <span class="hint">${esc(hint.slice(0, 90))}</span></label>`;
    }).join("");
    $("sources").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; i.checked ? state.filters.sources.add(i.value) : state.filters.sources.delete(i.value); recompute(); });

    const ymin = $<HTMLInputElement>("year-min"), ymax = $<HTMLInputElement>("year-max");
    for (const el of [ymin, ymax]) { el.min = String(y0); el.max = String(y1); el.step = "1"; }
    ymin.value = String(y0); ymax.value = String(y1);
    const syncYears = () => {
      let a = Number(ymin.value), b = Number(ymax.value);
      if (a > b) [a, b] = [b, a];
      state.filters.yearMin = a; state.filters.yearMax = b;
      $("year-min-val").textContent = String(a); $("year-max-val").textContent = String(b);
      recompute();
    };
    ymin.addEventListener("input", syncYears); ymax.addEventListener("input", syncYears);
    $("year-min-val").textContent = String(y0); $("year-max-val").textContent = String(y1);
    $<HTMLInputElement>("undated").addEventListener("change", (e) => { state.filters.includeUndated = (e.target as HTMLInputElement).checked; recompute(); });

    document.querySelectorAll<HTMLInputElement>("input[name=colorby]").forEach((el) =>
      el.addEventListener("change", () => { state.colorBy = el.value as "distance" | "reports"; if (last) updateMap(); }));

    const L: [string, string][] = [["hexes", "Coverage hexes"], ["borings", "Borings"], ["reports", "Report footprints"], ["gaps", "Gaps"], ["boundary", "City boundary"]];
    $("layers").innerHTML = L.map(([k, l]) => `<label class="check"><input type="checkbox" value="${k}" checked/> ${l}</label>`).join("");
    $("layers").addEventListener("change", (e) => { const i = e.target as HTMLInputElement; state.layers[i.value] = i.checked; applyLayerVisibility(); });

    $("export-csv").addEventListener("click", exportCSV);
    $("export-geojson").addEventListener("click", () => {
      if (!last) return;
      download("borings_filtered.geojson", "application/geo+json", JSON.stringify({ type: "FeatureCollection",
        features: last.filtered.map((b) => ({ type: "Feature", geometry: { type: "Point", coordinates: [b.lon, b.lat] }, properties: b })) }));
    });
    $("about-btn").addEventListener("click", () => { renderAbout(); $<HTMLDialogElement>("about").showModal(); });
    setRadius(state.radius);
    $("foot-sources").innerHTML = `Data built ${esc((manifest.built ?? manifest.generated).slice(0, 10))}. Basemap © OpenFreeMap, © OpenStreetMap contributors.`;
  }

  function exportCSV() {
    if (!last) return;
    const f = state.filters;
    const rows = [["metric", "value"],
      ["area_id", stats.area_id], ["h3_resolution", grid.resolution], ["n_cells", grid.cells.length],
      ["max_tier", f.maxTier], ["types", [...f.types].join(";")], ["sources", [...f.sources].join(";")],
      ["year_min", f.yearMin], ["year_max", f.yearMax], ["include_undated", f.includeUndated],
      ["n_borings", last.filtered.length], ["n_reports", new Set(last.filtered.map((b) => b.report_key).filter(Boolean)).size],
      ["median_nearest_m", median(last.dist)?.toFixed(1) ?? ""],
      ...[...new Set([...stats.radii_m, state.radius])].sort((a, b) => a - b).map((r) =>
        [`pct_covered_${r}m`, coverageCurve(last!.dist, grid.area, [r])[0].toFixed(3)])];
    download("coverage_stats.csv", "text/csv", rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"));
  }

  function renderAbout() {
    const rows = sources.map(([id, s]) => `<tr><td>${s.homepage && safeUrl(s.homepage) ? `<a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.name ?? id)}</a>` : esc(s.name ?? id)}<br><small>${esc(s.url ?? "")}</small></td>
      <td>${esc(s.tier)}</td><td>${esc(s.status)}${s.fetched ? `<br><small>${esc(s.fetched.slice(0, 10))}</small>` : ""}${s.reason ? `<br><small>${esc(s.reason)}</small>` : ""}</td>
      <td>${esc(s.n_after_dedupe ?? "–")}</td></tr>`).join("");
    const disclaimers = sources.filter(([, s]) => s.disclaimer).map(([, s]) => `<p><strong>${esc(s.name)}:</strong> ${esc(s.disclaimer)}</p>`).join("");
    $("about-body").innerHTML = `
      <p>This map shows where publicly available geotechnical borings and reports exist, and how much of the city's
      area lies within a chosen distance of at least one. Coverage is <em>area-based</em> on an H3 grid
      (resolution ${grid.resolution}, ${grid.cells.length.toLocaleString()} cells).</p>
      <p><strong>Not for design use.</strong> Locations are approximate and records may be incomplete or out of date.
      Always obtain site-specific investigation.</p>
      <h3>Sources</h3>
      <table><colgroup><col class="src"><col><col><col></colgroup><tr><th>Source</th><th>Tier</th><th>Status</th><th>Borings</th></tr>${rows}
      <tr><td>City boundary: US Census TIGERweb<br><small>${esc(manifest.boundary.url)}</small></td><td>1</td><td>${esc(manifest.boundary.fetched?.slice(0, 10) ?? "")}</td><td></td></tr></table>
      <h3>License tiers (cumulative)</h3>
      <ol><li>US federal work (public domain).</li>
      <li>Florida agency public record. In <em>Microdecisions v. Skinner</em> (Fla. 2d DCA 2004) the court held an agency can't claim copyright in a public record without legislative authorization.</li>
      <li>Open licence that requires attribution (CC BY, OGL).</li><li>Accessible under terms of use or a disclaimer.</li></ol>
      <p>Caveats: reports written by private consultants and hosted by an agency may still carry the consultant's copyright.
      University-held reports are excluded. This is not legal advice.</p>
      ${disclaimers}
      <p>Basemap: © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.</p>`;
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
