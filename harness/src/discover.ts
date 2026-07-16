// Discovery: run one sub-agent per region to find candidate centers, then apply
// exclusion rules (Goenka/Dhamma etc.) and de-duplicate.
import { runAgent, extractJson } from "./agent.js";
import { DISCOVERY_SYSTEM, discoveryPrompt } from "./prompts.js";
import { EXCLUSIONS } from "./config.js";
import { slugify, type Discovered } from "./schema.js";

export function isExcluded(d: Discovered): boolean {
  const name = d.name || "";
  const site = d.website || "";
  const lineage = d.lineage || "";
  if (EXCLUSIONS.namePatterns.some((re) => re.test(name))) return true;
  if (EXCLUSIONS.websitePatterns.some((re) => re.test(site))) return true;
  if (EXCLUSIONS.lineagePatterns.some((re) => re.test(lineage) || re.test(name))) return true;
  return false;
}

export async function discoverRegion(
  region: string,
  hint: string,
  existingNames: string[]
): Promise<Discovered[]> {
  const text = await runAgent({
    system: DISCOVERY_SYSTEM,
    prompt: discoveryPrompt(region, hint, existingNames),
    maxTurns: 30,
  });
  let found: Discovered[] = [];
  try {
    found = extractJson<Discovered[]>(text);
  } catch (e) {
    console.warn(`  ! Could not parse discovery output for ${region}: ${(e as Error).message}`);
    return [];
  }
  const kept = found.filter((d) => d?.name && !isExcluded(d));
  const dropped = found.length - kept.length;
  if (dropped > 0) console.log(`  · Excluded ${dropped} center(s) in ${region} (Goenka/out-of-scope).`);
  return kept;
}

/** De-duplicate discovered centers by slug across regions and against existing ids. */
export function dedupe(all: Discovered[], existingIds: Set<string>): Discovered[] {
  const seen = new Set(existingIds);
  const out: Discovered[] = [];
  for (const d of all) {
    const id = slugify(d.name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}
