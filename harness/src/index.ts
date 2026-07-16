// Orchestrator. Pipeline:
//   1) For each California region, a discovery sub-agent lists candidate centers.
//   2) Exclusions (Goenka/Dhamma etc.) applied, then de-duplicated against what's
//      already in /data/centers.
//   3) For each new center, a writer sub-agent researches it and produces a schema-
//      valid JSON entry, which is validated and saved to /data/centers/<id>.json.
//
// Usage:
//   npm run discover                 # all regions
//   npm run discover:region "Bay Area"
//   ANTHROPIC_API_KEY must be set (see .env.example).
//
// After running, rebuild the site data:  node ../scripts/build-data.mjs
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CALIFORNIA_REGIONS } from "./config.js";
import { discoverRegion, dedupe } from "./discover.js";
import { writeEntry } from "./write-entry.js";
import { ROOT, type Discovered } from "./schema.js";

const CENTERS_DIR = join(ROOT, "data", "centers");

function existingIds(): Set<string> {
  if (!existsSync(CENTERS_DIR)) return new Set();
  return new Set(readdirSync(CENTERS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  // Optional single-region filter: `npm run discover:region "Bay Area"`.
  const regionArgIdx = process.argv.indexOf("--region");
  const onlyRegion = regionArgIdx !== -1 ? process.argv[regionArgIdx + 1] : null;
  const regions = onlyRegion
    ? CALIFORNIA_REGIONS.filter((r) => r.region.toLowerCase() === onlyRegion.toLowerCase())
    : CALIFORNIA_REGIONS;

  if (!regions.length) {
    console.error(`Unknown region "${onlyRegion}". Options: ${CALIFORNIA_REGIONS.map((r) => r.region).join(", ")}`);
    process.exit(1);
  }

  const known = existingIds();
  const knownNames: string[] = []; // could be enriched by reading existing entries' names

  // --- Phase 1: discovery ---
  const discovered: Discovered[] = [];
  for (const { region, hint } of regions) {
    console.log(`\n🔍 Discovering centers in ${region}…`);
    const found = await discoverRegion(region, hint, knownNames);
    console.log(`  → ${found.length} candidate(s).`);
    for (const d of found) (d as any).__region = region;
    discovered.push(...found);
  }

  const unique = dedupe(discovered, known);
  console.log(`\n📋 ${unique.length} new unique center(s) to write (after de-dup & exclusions).`);

  // --- Phase 2: write entries ---
  const summary = { written: 0, skipped: 0, excluded: 0, invalid: 0, error: 0 };
  for (const d of unique) {
    const region = (d as any).__region || "California";
    process.stdout.write(`✍️  ${d.name} … `);
    const res = await writeEntry(d, region);
    switch (res.status) {
      case "written": summary.written++; console.log(`saved (${res.id}).`); break;
      case "skipped-exists": summary.skipped++; console.log("already exists."); break;
      case "excluded": summary.excluded++; console.log("excluded on second look."); break;
      case "invalid": summary.invalid++; console.log(`INVALID — ${res.detail}`); break;
      default: summary.error++; console.log(`ERROR — ${res.detail}`);
    }
  }

  console.log(
    `\n✅ Done. written=${summary.written} skipped=${summary.skipped} excluded=${summary.excluded} invalid=${summary.invalid} error=${summary.error}`
  );
  console.log("Next: node ../scripts/build-data.mjs  to refresh public/data/centers.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
