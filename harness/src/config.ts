// Static configuration for the discovery harness.

export const MODEL = process.env.HARNESS_MODEL || "claude-sonnet-4-5";

// California is covered region-by-region so each discovery sub-agent has a
// tractable, well-scoped search area. Add/adjust buckets here; the `region`
// string is written onto each entry and drives the site's region filter.
export const CALIFORNIA_REGIONS: { region: string; hint: string }[] = [
  { region: "Bay Area", hint: "San Francisco, Marin, Sonoma, Napa, East Bay, Peninsula, Santa Cruz Mountains" },
  { region: "Northern California", hint: "Mendocino, Humboldt, Shasta, Sierra foothills, Sacramento Valley" },
  { region: "Central Coast", hint: "Monterey, Big Sur, San Luis Obispo, Santa Barbara" },
  { region: "Central Valley & Sierra", hint: "Fresno, Sierra Nevada, Yosemite area, Nevada City, Grass Valley" },
  { region: "Southern California", hint: "Los Angeles, Ojai, San Diego, Escondido, Joshua Tree, Idyllwild" },
];

// Exclusion rules. Goenka-lineage centers (S.N. Goenka / Vipassana Meditation /
// Dhamma.org network) are explicitly excluded per project scope.
export const EXCLUSIONS = {
  // No traditions are excluded — Goenka / Vipassana-Meditation (dhamma.org) centers
  // are now included. Add patterns here if you ever want to drop a category again.
  namePatterns: [] as RegExp[],
  websitePatterns: [] as RegExp[],
  lineagePatterns: [] as RegExp[],
  note: "All traditions are included, including Goenka / Vipassana-Meditation (dhamma.org) centers.",
};

export const STATE = { code: "CA", name: "California" };
