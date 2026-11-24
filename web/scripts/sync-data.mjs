// Copy the pipeline's committed outputs into public/data so Vite serves/bundles them.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data/processed");
const dest = resolve(here, "../public/data");
const files = ["boundary.geojson", "borings.geojson", "reports.geojson", "gaps.geojson", "areas.geojson",
  "stats.json", "manifest.json"];
// optional: copied when present (the Geosetta model grid needs an API key to build)
const optional = ["model_grid.geojson"];
mkdirSync(dest, { recursive: true });
const missing = files.filter((f) => !existsSync(resolve(src, f)));
if (missing.length) {
  console.error(`missing in data/processed: ${missing.join(", ")}. Run: python -m pipeline all`);
  process.exit(1);
}
const present = optional.filter((f) => existsSync(resolve(src, f)));
for (const f of [...files, ...present]) copyFileSync(resolve(src, f), resolve(dest, f));
console.log(`copied ${files.length + present.length} files to public/data`);
