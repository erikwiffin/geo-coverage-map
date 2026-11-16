// Area sources -> pseudo-points at the H3 cells each area overlaps (mirrors pipeline/areas.py).
import { cellToLatLng, uncompactCells } from "h3-js";
import type { Boring } from "./coverage";

export function areaPseudoPoints(fc: GeoJSON.FeatureCollection, resolution: number): Boring[] {
  const out: Boring[] = [];
  for (const f of fc.features) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (!p.cells) continue;
    for (const c of uncompactCells(String(p.cells).split(","), resolution)) {
      const [lat, lon] = cellToLatLng(c);
      out.push({
        boring_uid: `${p.area_uid}#${c}`, source_id: p.source_id as string, tier: p.tier as number,
        kind: p.kind as string, boring_type: p.boring_type as string, year: (p.year as number) ?? null,
        report_key: p.report_key as string, lon, lat, pseudo: true,
      });
    }
  }
  return out;
}
