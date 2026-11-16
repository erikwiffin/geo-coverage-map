import { describe, expect, it } from "vitest";
import { decodeState, encodeState, ViewState } from "../src/urlstate";

const T = ["SPT", "CPT", "Auger", "Well"], S = ["fdot_d2", "fgs_wells", "sjrwmd_erp"], L = ["hexes", "gaps", "borings"];
const D: ViewState = { radius: 250, maxTier: 4, types: new Set(T), sources: new Set(S), yearMin: 1930, yearMax: 2026,
  includeUndated: true, hiddenLayers: new Set() };

describe("url state", () => {
  it("defaults encode to an empty query", () => expect(encodeState(D, D, T, S)).toBe(""));
  it("round-trips a modified view", () => {
    const v: ViewState = { ...D, radius: 500, maxTier: 2, types: new Set(["SPT", "CPT"]), sources: new Set(["fdot_d2"]),
      yearMin: 2000, yearMax: 2020, includeUndated: false, hiddenLayers: new Set(["gaps"]),
      map: { zoom: 14.5, lat: 29.65123, lng: -82.32456 }, about: "fdot_d2" };
    const q = encodeState(v, D, T, S);
    expect(q).toBe("r=500&tier=2&types=SPT,CPT&src=fdot_d2&y=2000-2020&undated=0&hide=gaps&map=14.50/29.65123/-82.32456&about=fdot_d2");
    expect(decodeState("?" + q, D, T, S, L)).toEqual(v);
  });
  it("empty src means no sources; junk is ignored", () => {
    const v = decodeState("?src=&tier=9&r=abc&types=SPT,bogus&map=1/2&about=<script>", D, T, S, L);
    expect(v.sources.size).toBe(0);
    expect(v.maxTier).toBe(4); expect(v.radius).toBe(250); expect([...v.types]).toEqual(["SPT"]);
    expect(v.map).toBeUndefined(); expect(v.about).toBeUndefined();
  });
});
