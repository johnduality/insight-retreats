# Insight Retreats — discovery harness

> **Recommended: run it from Cowork — no command line.** Just ask Claude in Cowork to
> "add retreat centers in <area>" and it handles discovery, writing, validation, ad-hoc
> tags, and rebuild for you. See [COWORK.md](COWORK.md). The Node/SDK CLI described below
> is an optional path for large headless batches.

A small Node/TypeScript harness that uses the **Claude Agent SDK** to populate the
catalogue. It orchestrates two kinds of Claude sub-agents:

1. **Discovery agents** — one per California region. Each uses web search to list
   real retreat centers in its area and returns structured JSON. Goenka /
   Vipassana-Meditation (dhamma.org) centers are excluded by rule.
2. **Writer agents** — one per newly discovered center. Each researches the center
   and produces a single schema-valid entry (tradition, technique, schedule, cost,
   food/work flags, a one-paragraph "about", standardized tags, and sources).

The orchestrator (`src/index.ts`) glues them together, de-duplicates, validates
against `../schema/entry.schema.json` + `../schema/tags.json`, and writes one file
per center to `../data/centers/<id>.json`.

## Design notes

- Sub-agents only get **web tools** (`WebSearch`, `WebFetch`) — no filesystem
  access. The Node orchestrator does all validation and file writing, so a
  hallucinated or malformed entry can't reach disk.
- Exclusions are enforced **twice**: once on discovery output, and again after the
  writer agent fills in the tradition/lineage.
- Entries are marked `reviewStatus: "unverified"` so you can distinguish
  machine-written entries from human-reviewed ones (like the two seed entries).

## Setup

```bash
cd harness
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
```

## Run

```bash
npm run discover                    # all California regions
npm run discover:region "Bay Area"  # a single region
npm run typecheck                   # type-check without running
```

Then refresh the site's aggregated data:

```bash
node ../scripts/build-data.mjs
```

> The two seed entries (Deer Park Monastery, Spirit Rock) were written and
> human-reviewed by hand and will be **skipped** by the harness because their
> files already exist. Delete a file and re-run to regenerate it.

## Files

| File | Role |
| --- | --- |
| `src/index.ts` | Orchestrator / CLI |
| `src/config.ts` | Regions, model, exclusion rules |
| `src/discover.ts` | Discovery agent + exclusion + de-dup |
| `src/write-entry.ts` | Writer agent + validation + save |
| `src/agent.ts` | Claude Agent SDK wrapper + JSON extraction |
| `src/prompts.ts` | System/user prompts for both roles |
| `src/schema.ts` | Shared types, schema/tag loading, validation |
