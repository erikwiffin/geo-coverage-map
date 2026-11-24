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
  it("layers hidden by default stay hidden, and can be shown with an empty hide", () => {
    const d: ViewState = { ...D, hiddenLayers: new Set(["model"]), modelVar: "depth_fines_ft" };
    expect(encodeState(d, d, T, S)).toBe("");
    expect([...decodeState("", d, T, S, [...L, "model"]).hiddenLayers]).toEqual(["model"]);
    const shown = { ...d, hiddenLayers: new Set<string>(), modelVar: "site_class" };
    const q = encodeState(shown, d, T, S);
    expect(q).toBe("hide=&mv=site_class");
    expect(decodeState("?" + q, d, T, S, [...L, "model"], ["depth_fines_ft", "site_class"])).toEqual(shown);
  });
});
