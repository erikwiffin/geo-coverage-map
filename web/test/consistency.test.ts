// SPEC §6.2: web stats must match the authoritative Python stats.json within 0.5 pp.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyFilters, Boring, coverageCurve, makeGrid, nearestDistances } from "../src/coverage";

const DIR = resolve(__dirname, "../../data/processed");
const have = existsSync(resolve(DIR, "stats.json"));
const load = (f: string) => JSON.parse(readFileSync(resolve(DIR, f), "utf8"));

describe.skipIf(!have)("web vs pipeline consistency", () => {
  const stats = load("stats.json"), man = load("manifest.json");
  const boundary = load("boundary.geojson"), fc = load("borings.geojson");
  const borings: Boring[] = fc.features.map((f: { properties: Boring }) => f.properties);
  const grid = makeGrid(boundary.features[0].geometry, stats.h3_resolution);
  const ok = Object.entries(man.sources as Record<string, { status: string; default_on?: boolean }>).filter(([, s]) => s.status === "ok");
  const base = { maxTier: 4, types: new Set(["SPT", "CPT", "Auger", "Well", "Other", "Site"]), yearMin: -1e9, yearMax: 1e9, includeUndated: true };

  it("uses the same H3 cell count", () => expect(grid.cells.length).toBe(stats.n_cells));

  it("default filters match stats.json pct_covered", () => {
    const sources = new Set(ok.filter(([, s]) => s.default_on !== false).map(([id]) => id));
    const d = nearestDistances(grid, applyFilters(borings, { ...base, sources }).filter((b) => b.kind !== "geologic_well"));
    const web = coverageCurve(d, grid.area, stats.radii_m);
    stats.radii_m.forEach((r: number, i: number) => expect(Math.abs(web[i] - stats.pct_covered[String(r)])).toBeLessThan(0.5));
  });

  it("all sources (incl. wells) match stats.json pct_covered_all_sources", () => {
    const sources = new Set(ok.map(([id]) => id));
    const d = nearestDistances(grid, applyFilters(borings, { ...base, sources }));
    const web = coverageCurve(d, grid.area, stats.radii_m);
    stats.radii_m.forEach((r: number, i: number) => expect(Math.abs(web[i] - stats.pct_covered_all_sources[String(r)])).toBeLessThan(0.5));
  });
});
