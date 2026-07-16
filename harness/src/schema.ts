// Loads the shared JSON schema + tag vocabulary and provides light validation
// so entries produced by sub-agents stay consistent with the site. Also supports
// sub-agents proposing brand-new tags, which get registered into the master
// vocabulary (schema/tags.json) on the fly.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..", "..");

const TAGS_PATH = join(ROOT, "schema", "tags.json");
export const entrySchema = JSON.parse(readFileSync(join(ROOT, "schema", "entry.schema.json"), "utf8"));
export const tagVocab = JSON.parse(readFileSync(TAGS_PATH, "utf8"));

// Live set of every valid tag id. Mutated by registerProposedTags().
const TAG_SET = new Set<string>(tagVocab.groups.flatMap((g: any) => g.tags.map((t: any) => t.id)));
/** Snapshot list (used to seed the writer prompt). */
export const VALID_TAGS: string[] = [...TAG_SET];

export interface ProposedTag {
  id: string;
  label: string;
  group?: string; // one of the existing group ids; defaults to "practical"
}

export interface CenterEntry {
  id: string;
  name: string;
  aka?: string[];
  website?: string;
  location: {
    address?: string; city: string; county?: string; region?: string;
    state: string; lat: number; lng: number;
  };
  tradition: string;
  technique?: string;
  influences?: string[];
  about: string;
  description?: string;
  schedule?: string;
  cost?: string;
  pricePerDay?: { min: number | null; max: number | null; unit?: "night" | "day"; notes?: string; source?: string };
  foodServed?: "yes" | "no" | "partial" | "unknown";
  foodType?: "vegan" | "vegetarian" | "omnivore" | "mixed" | "unknown";
  foodNotes?: string;
  workRequired?: "yes" | "no" | "partial" | "unknown";
  workNotes?: string;
  tags: string[];
  proposedTags?: ProposedTag[]; // stripped before the entry is saved
  sources?: { title?: string; url: string }[];
  meta: { generatedBy: string; lastUpdated: string; reviewStatus?: string };
}

export interface Discovered {
  name: string;
  city?: string;
  website?: string;
  lineage?: string;
  reason?: string; // why it belongs / short note
}

/**
 * Register any new tags a sub-agent proposed into schema/tags.json so they become
 * part of the master vocabulary. Existing ids are ignored. Returns the ids added.
 */
export function registerProposedTags(proposed: ProposedTag[] | undefined): string[] {
  if (!Array.isArray(proposed) || !proposed.length) return [];
  const added: string[] = [];
  for (const p of proposed) {
    if (!p || !p.id) continue;
    const id = slugify(p.id);
    if (!id || TAG_SET.has(id)) continue;
    const groupId = p.group && tagVocab.groups.some((g: any) => g.id === p.group) ? p.group : "practical";
    const group = tagVocab.groups.find((g: any) => g.id === groupId);
    group.tags.push({ id, label: (p.label || id).slice(0, 60) });
    TAG_SET.add(id);
    added.push(id);
  }
  if (added.length) writeFileSync(TAGS_PATH, JSON.stringify(tagVocab, null, 2) + "\n");
  return added;
}

/** Returns an array of human-readable problems; empty array means valid enough to save. */
export function validateEntry(e: Partial<CenterEntry>): string[] {
  const problems: string[] = [];
  for (const key of entrySchema.required) if (!(key in e)) problems.push(`missing required field "${key}"`);
  if (e.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) problems.push(`id "${e.id}" is not a valid slug`);
  if (e.location) {
    const { lat, lng } = e.location;
    if (typeof lat !== "number" || typeof lng !== "number") problems.push("location.lat/lng must be numbers");
  }
  for (const t of e.tags ?? []) if (!TAG_SET.has(t)) problems.push(`unknown tag "${t}"`);
  return problems;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
