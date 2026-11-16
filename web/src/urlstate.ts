// Shareable view state <-> URL query string. Only values that differ from the defaults are
// written, so the plain URL stays clean and old links keep working as defaults change.
export interface ViewState {
  radius: number;
  maxTier: number;
  types: Set<string>;
  sources: Set<string>;
  yearMin: number;
  yearMax: number;
  includeUndated: boolean;
  hiddenLayers: Set<string>;
  map?: { zoom: number; lat: number; lng: number };
  about?: string;
}

const setEq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const list = (s: Set<string>, order: string[]) => order.filter((x) => s.has(x)).join(",");

export function encodeState(s: ViewState, d: ViewState, typeOrder: string[], sourceOrder: string[]): string {
  const q = new URLSearchParams();
  if (s.radius !== d.radius) q.set("r", String(s.radius));
  if (s.maxTier !== d.maxTier) q.set("tier", String(s.maxTier));
  if (!setEq(s.types, d.types)) q.set("types", list(s.types, typeOrder));
  if (!setEq(s.sources, d.sources)) q.set("src", list(s.sources, sourceOrder));
  if (s.yearMin !== d.yearMin || s.yearMax !== d.yearMax) q.set("y", `${s.yearMin}-${s.yearMax}`);
  if (s.includeUndated !== d.includeUndated) q.set("undated", s.includeUndated ? "1" : "0");
  if (s.hiddenLayers.size) q.set("hide", [...s.hiddenLayers].sort().join(","));
  if (s.map) q.set("map", `${s.map.zoom.toFixed(2)}/${s.map.lat.toFixed(5)}/${s.map.lng.toFixed(5)}`);
  if (s.about) q.set("about", s.about);
  return q.toString().replace(/%2C/g, ",").replace(/%2F/g, "/"); // keep , and / readable
}

/** Apply query params onto a copy of the defaults; unknown or malformed values are ignored. */
export function decodeState(search: string, d: ViewState, validTypes: string[], validSources: string[],
  validLayers: string[]): ViewState {
  const q = new URLSearchParams(search);
  const s: ViewState = { ...d, types: new Set(d.types), sources: new Set(d.sources), hiddenLayers: new Set() };
  const num = (k: string) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : null; };
  const pick = (k: string, valid: string[]) => new Set((q.get(k) ?? "").split(",").filter((x) => valid.includes(x)));
  const r = num("r"); if (r !== null && r > 0 && r <= 5000) s.radius = Math.round(r);
  const t = num("tier"); if (t !== null && [1, 2, 3, 4].includes(t)) s.maxTier = t;
  if (q.has("types")) s.types = pick("types", validTypes);
  if (q.has("src")) s.sources = pick("src", validSources);
  const y = (q.get("y") ?? "").match(/^(-?\d+)-(-?\d+)$/);
  if (y) { s.yearMin = Math.min(+y[1], +y[2]); s.yearMax = Math.max(+y[1], +y[2]); }
  if (q.has("undated")) s.includeUndated = q.get("undated") !== "0";
  if (q.has("hide")) s.hiddenLayers = pick("hide", validLayers);
  const m = (q.get("map") ?? "").split("/").map(Number);
  if (m.length === 3 && m.every(Number.isFinite) && Math.abs(m[1]) <= 90 && Math.abs(m[2]) <= 180)
    s.map = { zoom: m[0], lat: m[1], lng: m[2] };
  if (q.get("about") && validSources.concat(["guide"]).includes(q.get("about")!)) s.about = q.get("about")!;
  return s;
}
