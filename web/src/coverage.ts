// Pure coverage computation shared by the app and the consistency test (SPEC §6.2).
import { cellArea, cellToLatLng, polygonToCells, gridDisk, cellsToMultiPolygon, cellToParent } from "h3-js";
import KDBush from "kdbush";
import { BucketNN } from "./nn";

export const EARTH_R = 6371008.8;

export interface Boring {
  boring_uid: string;
  source_id: string;
  tier: number;
  kind: string;
  boring_type: string;
  year: number | null;
  report_key: string | null;
  lon: number;
  lat: number;
  pseudo?: boolean; // area pseudo-point: counts toward coverage, never drawn as a boring
  [k: string]: unknown;
}

export interface Grid {
  cells: string[];
  lon: Float64Array;
  lat: Float64Array;
  area: Float64Array;
  totalArea: number;
  resolution: number;
}

export interface Filters {
  maxTier: number;
  types: Set<string>;
  sources: Set<string>;
  yearMin: number;
  yearMax: number;
  includeUndated: boolean;
}

/** Polyfill a GeoJSON (Multi)Polygon with H3 cells by center containment, like h3-py. */
export function makeGrid(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon, resolution: number): Grid {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const set = new Set<string>();
  for (const p of polys) for (const c of polygonToCells(p as number[][][], resolution, true)) set.add(c);
  const cells = [...set].sort();
  const n = cells.length;
  const lon = new Float64Array(n), lat = new Float64Array(n), area = new Float64Array(n);
  let totalArea = 0;
  for (let i = 0; i < n; i++) {
    const [la, lo] = cellToLatLng(cells[i]);
    lat[i] = la; lon[i] = lo;
    area[i] = cellArea(cells[i], "m2");
    totalArea += area[i];
  }
  return { cells, lon, lat, area, totalArea, resolution };
}

export function applyFilters(borings: Boring[], f: Filters): Boring[] {
  return borings.filter((b) =>
    b.tier <= f.maxTier &&
    f.types.has(b.boring_type) &&
    f.sources.has(b.source_id) &&
    (b.year == null ? f.includeUndated : b.year >= f.yearMin && b.year <= f.yearMax));
}

/**
 * Great-circle distance (m) from each cell centre to the nearest boring. Uses BucketNN instead of
 * geokdbush for the nearest search: geokdbush took ~370 ms for 84k res-11 cells (target 200 ms).
 */
export function nearestDistances(grid: Grid, borings: Boring[]): Float64Array {
  const n = grid.cells.length;
  const out = new Float64Array(n).fill(Infinity);
  if (!borings.length) return out;
  const lat0 = grid.lat.length ? grid.lat[0] : borings[0].lat;
  const nn = new BucketNN(borings.map((b) => b.lon), borings.map((b) => b.lat), lat0);
  for (let i = 0; i < n; i++) {
    const b = borings[nn.nearest(grid.lon[i], grid.lat[i])];
    out[i] = haversine(grid.lon[i], grid.lat[i], b.lon, b.lat);
  }
  return out;
}

export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

export function pctCovered(dist: Float64Array, area: Float64Array, radius: number): number {
  let cov = 0, tot = 0;
  for (let i = 0; i < dist.length; i++) { tot += area[i]; if (dist[i] <= radius) cov += area[i]; }
  return tot ? (100 * cov) / tot : 0;
}

/** Coverage curve at many radii in one pass (sorted distances, cumulative area). */
export function coverageCurve(dist: Float64Array, area: Float64Array, radii: number[]): number[] {
  const order = new Uint32Array(dist.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => dist[a] - dist[b]);
  let tot = 0;
  for (let i = 0; i < area.length; i++) tot += area[i];
  const sorted = [...radii].map((r, i) => [r, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(radii.length);
  let j = 0, cum = 0;
  for (const [r, k] of sorted) {
    while (j < order.length && dist[order[j]] <= r) { cum += area[order[j]]; j++; }
    out[k] = tot ? (100 * cum) / tot : 0;
  }
  return out;
}

/** Distinct report keys within radius of each cell centre. Planar KDBush in local metres
 * (equirectangular at the grid's latitude; error far below the radius over a city), with an exact
 * haversine check on candidates near the edge. */
export function reportCounts(grid: Grid, borings: Boring[], radius: number, only?: number[]): Uint16Array {
  const keyed = borings.filter((b) => b.report_key);
  const out = new Uint16Array(grid.cells.length);
  if (!keyed.length || !grid.cells.length) return out;
  const lat0 = grid.lat[0] * Math.PI / 180, ky = 111194.93, kx = ky * Math.cos(lat0);
  const keyId = new Map<string, number>();
  const kid = new Int32Array(keyed.length);
  const index = new KDBush(keyed.length);
  keyed.forEach((b, i) => {
    let id = keyId.get(b.report_key as string);
    if (id === undefined) { id = keyId.size; keyId.set(b.report_key as string, id); }
    kid[i] = id; index.add(b.lon * kx, b.lat * ky);
  });
  index.finish();
  const seen = new Int32Array(keyId.size).fill(-1);
  const cells = only ?? Array.from(grid.cells.keys());
  for (const i of cells) {
    let n = 0;
    for (const h of index.within(grid.lon[i] * kx, grid.lat[i] * ky, radius * 1.002)) {
      const k = kid[h];
      if (seen[k] === i) continue;
      const b = keyed[h];
      if (haversine(grid.lon[i], grid.lat[i], b.lon, b.lat) > radius) continue;
      seen[k] = i; n++;
    }
    out[i] = Math.min(n, 65535);
  }
  return out;
}

export function median(a: ArrayLike<number>): number | null {
  const v = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface Gap { rank: number; areaKm2: number; nCells: number; geometry: GeoJSON.MultiPolygon }

/** Connected clusters of uncovered cells, largest first. */
const neighbourCache = new WeakMap<Grid, Int32Array[]>();

/** Index-based neighbour lists for a grid (computed once per grid). */
function neighbours(grid: Grid): Int32Array[] {
  let nb = neighbourCache.get(grid);
  if (nb) return nb;
  const pos = new Map<string, number>();
  grid.cells.forEach((c, i) => pos.set(c, i));
  nb = grid.cells.map((c) => Int32Array.from(gridDisk(c, 1).map((n) => pos.get(n) ?? -1).filter((j) => j >= 0)));
  neighbourCache.set(grid, nb);
  return nb;
}

export function findGaps(grid: Grid, dist: Float64Array, radius: number, topN = 10): Gap[] {
  const nb = neighbours(grid);
  const n = grid.cells.length;
  const seen = new Uint8Array(n);
  const clusters: { idx: number[]; area: number }[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || !(dist[start] > radius)) continue;
    seen[start] = 1;
    const stack = [start], comp: number[] = [];
    let area = 0;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c); area += grid.area[c];
      for (const j of nb[c]) if (!seen[j] && dist[j] > radius) { seen[j] = 1; stack.push(j); }
    }
    clusters.push({ idx: comp, area });
  }
  clusters.sort((a, b) => b.area - a.area);
  return clusters.slice(0, topN).map((c, i) => ({
    rank: i + 1,
    areaKm2: c.area / 1e6,
    nCells: c.idx.length,
    geometry: { type: "MultiPolygon", coordinates: cellsToMultiPolygon(c.idx.map((j) => grid.cells[j]), true) },
  }));
}


export { cellToParent };
