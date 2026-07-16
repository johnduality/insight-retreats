// Prompt builders for the two sub-agent roles.
import { EXCLUSIONS, STATE } from "./config.js";
import { VALID_TAGS, tagVocab } from "./schema.js";

const tagCheatSheet = tagVocab.groups
  .map((g: any) => `  ${g.label}: ${g.tags.map((t: any) => t.id).join(", ")}`)
  .join("\n");

// ---- Discovery sub-agent ----
export const DISCOVERY_SYSTEM = `You are a meticulous researcher cataloguing meditation and contemplative
retreat centers in ${STATE.name}. You use web search to find real, currently operating centers.

SCOPE: ${EXCLUSIONS.note} Do NOT include purely commercial spa/"wellness" resorts with no
contemplative tradition, or yoga studios that don't host residential or day retreats.

INCLUDE: Buddhist (Zen, Theravada/Insight, Tibetan, Plum Village, Goenka / Vipassana-Meditation,
etc.), Hindu/Yoga, Christian contemplative, interfaith, and secular mindfulness retreat centers
that run actual retreats. Tag Goenka-lineage centers with the "goenka" tag.

Only include centers you can verify from a real website or reputable source.`;

export function discoveryPrompt(region: string, hint: string, existingNames: string[]): string {
  return `Find meditation / contemplative RETREAT CENTERS in the "${region}" region of ${STATE.name}.
Sub-areas to cover: ${hint}.

Already catalogued (do NOT return these): ${existingNames.length ? existingNames.join(", ") : "(none yet)"}.

Use web search. Return ONLY a JSON array (no prose, no code fences) of objects with this shape:
[
  { "name": "...", "city": "...", "website": "https://...", "lineage": "e.g. Zen / Insight / Tibetan / Yoga / Christian contemplative", "reason": "one short line on what makes it a retreat center" }
]
Aim for 5-15 solid, verifiable centers. Skip anything matching the exclusions above.`;
}

// ---- Entry-writer sub-agent ----
export const WRITER_SYSTEM = `You are writing a single catalogue entry for a retreat center directory.
Accuracy matters more than completeness: only state facts you can support from the center's own
website or reputable sources found via web search. If a detail is unknown, use "unknown" (for the
food/work fields) or omit the optional field rather than guessing.

You must output a SINGLE JSON object matching this TypeScript-ish shape:
{
  id: string (lowercase-hyphen slug),
  name: string,
  aka?: string[],
  website?: string,
  location: { address?, city, county?, region?, state: "CA", lat: number, lng: number },
  tradition: string,        // e.g. "Insight Meditation (Vipassana) in the Theravada tradition"
  technique?: string,       // CONCISE — a short phrase list, not prose
  influences?: string[],
  about: string,            // The ONLY paragraph: ~3-6 sentences, plain language
  schedule?: string,        // CONCISE — one short line
  cost?: string,            // CONCISE — one short line on the model (dana/sliding scale/fixed fee)
  pricePerDay?: { min: number|null, max: number|null, unit: "night"|"day", notes?: string, source?: string },
  foodServed?: "yes"|"no"|"partial"|"unknown",
  foodType?: "vegan"|"vegetarian"|"omnivore"|"mixed"|"unknown",
  foodNotes?: string,       // CONCISE
  workRequired?: "yes"|"no"|"partial"|"unknown",
  workNotes?: string,       // CONCISE
  tags: string[],           // ids from the controlled vocabulary below (plus any you propose)
  proposedTags?: { id, label, group? }[],  // see "PROPOSING NEW TAGS" below
  sources?: { title?, url }[],
  meta: { generatedBy: "harness/1.0 (claude)", lastUpdated: "YYYY-MM-DD", reviewStatus: "unverified" }
}

CRITICAL — PER-DAY PRICE: You MUST determine a representative per-night dollar rate for a
STANDARD MULTI-DAY RESIDENTIAL RETREAT — use a weeklong retreat option where one exists.
Take the ordinary published price tiers (e.g. basic through standard/sustainer), and DIVIDE
the retreat total by its number of nights to get the per-night min/max. IGNORE scholarship or
subsidised rates, donation floors/minimums, and one-time or day-only events. Record how you
derived it in pricePerDay.notes, and put the exact retreat/registration page URL you used in
pricePerDay.source. Only use null min/max for centers that are strictly donation-only with no
suggested amount.

STYLE: Only `about` is a paragraph. Keep technique, schedule, cost, foodNotes, and workNotes
to a single concise line each. Do not write a long `description`.

TAGS: After drafting, go group-by-group through the controlled vocabulary above and apply
every tag that clearly applies — cross-check the structured fields (foodServed -> diet-* /
meals-included, workRequired -> work-practice / no-work-required, pricePerDay / cost -> the
cost-model tags). Completeness matters, but only for tags that genuinely fit; keep the
"accuracy over quantity, never invent a tag inline" rule.

PROPOSING NEW TAGS: Strongly prefer the existing vocabulary. But if a center has a genuinely
important, reusable attribute that no existing tag captures (something other centers would
also plausibly share — NOT a one-off), you may propose new tag(s) via a top-level
`proposedTags` array, e.g. [{ "id": "hot-springs", "label": "Hot Springs", "group": "practical" }].
Use a lowercase-hyphen id, a short Title Case labe