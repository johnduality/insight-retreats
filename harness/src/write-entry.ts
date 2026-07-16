// Entry writing: run a writer sub-agent for one center, validate its JSON against
// the shared schema + tag vocabulary, normalise a few fields, and save it.
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runAgent, extractJson } from "./agent.js";
import { WRITER_SYSTEM, writerPrompt } from "./prompts.js";
import { isExcluded } from "./discover.js";
import { ROOT, slugify, validateEntry, registerProposedTags, type CenterEntry, type Discovered } from "./schema.js";

const CENTERS_DIR = join(ROOT, "data", "centers");

export interface WriteResult {
  status: "written" | "skipped-exists" | "excluded" | "invalid" | "error";
  id?: string;
  detail?: string;
}

export async function writeEntry(d: Discovered, region: string, force = false): Promise<WriteResult> {
  const id = slugify(d.name);
  const file = join(CENTERS_DIR, `${id}.json`);
  if (!force && existsSync(file)) return { status: "skipped-exists", id };

  const text = await runAgent({
    system: WRITER_SYSTEM,
    prompt: writerPrompt({ name: d.name, city: d.city, website: d.website, region }),
    maxTurns: 30,
  });

  let entry: CenterEntry;
  try {
    entry = extractJson<CenterEntry>(text);
  } catch (e) {
    return { status: "error", id, detail: `parse failed: ${(e as Error).message}` };
  }

  // Normalise / backfill.
  entry.id = entry.id || id;
  if (entry.location) {
    entry.location.state = "CA";
    entry.location.region = entry.location.region || region;
  }
  entry.meta = {
    generatedBy: "harness/1.0 (claude)",
    lastUpdated: new Date().toISOString().slice(0, 10),
    reviewStatus: "unverified",
    ...entry.meta,
  };

  // Safety net: re-check exclusions using what the writer discovered.
  if (isExcluded({ name: entry.name, website: entry.website, lineage: entry.tradition })) {
    return { status: "excluded", id: entry.id };
  }

  // Register any brand-new tags the sub-agent proposed, then drop the field so it
  // isn't written into the entry file (tags now live in the master vocabulary).
  const added = registerProposedTags(entry.proposedTags);
  if (added.length) console.log(`   + registered new tag(s): ${added.join(", ")}`);
  delete entry.proposedTags;

  const problems = validateEntry(entry);
  if (problems.length) return { status: "invalid", id: entry.id, detail: problems.join("; ") };

  writeFileSync(file, JSON.stringify(entry, null, 2) + "\n");
  return { status: "written", id: entry.id };
}
