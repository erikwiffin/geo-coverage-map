import { describe, expect, it } from "vitest";
import KDBush from "kdbush";
import { around } from "geokdbush";
import { BucketNN } from "../src/nn";
import { haversine, makeGrid, nearestDistances, Boring } from "../src/coverage";

function rand(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

describe("BucketNN", () => {
  it("matches geokdbush nearest on random data", () => {
    const r = rand(42);
    const pts = Array.from({ length: 2000 }, () => [-82.42 + r() * 0.2, 29.59 + r() * 0.18]);
    // clustered + sparse mix
    for (let i = 0; i < 200; i++) pts.push([-82.33 + r() * 0.001, 29.65 + r() * 0.001]);
    const nn = new BucketNN(pts.map((p) => p[0]), pts.map((p) => p[1]), 29.65);
    const idx = new KDBush(pts.length); for (const p of pts) idx.add(p[0], p[1]); idx.finish();
    for (let q = 0; q < 3000; q++) {
      const lon = -82.5 + r() * 0.4, lat = 29.5 + r() * 0.35;
      const a = pts[nn.nearest(lon, lat)], b = pts[around(idx, lon, lat, 1)[0] as number];
      expect(haversine(lon, lat, a[0], a[1])).toBeCloseTo(haversine(lon, lat, b[0], b[1]), 0);
    }
  });

  it("meets the recompute performance target (~85k cells x 10k borings < 200 ms)", () => {
    const r = rand(7);
    const disc: GeoJSON.Polygon = { type: "Polygon", coordinates: [[...Array(65).keys()].map((k) => {
      const a = (k / 64) * 2 * Math.PI; return [-82.33 + 0.08 * Math.cos(a), 29.65 + 0.07 * Math.sin(a)];
    })] };
    const grid = makeGrid(disc, 11);
    const borings = Array.from({ length: 10000 }, (_, i) => ({ boring_uid: String(i), lon: -82.41 + r() * 0.16,
      lat: 29.58 + r() * 0.14 })) as Boring[];
    nearestDistances(grid, borings); // warm up JIT
    const t = performance.now();
    nearestDistances(grid, borings);
    const ms = performance.now() - t;
    console.log(`cells=${grid.cells.length} borings=10000 recompute=${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(200);
  });
});
