# Adding centers from Cowork (no command line needed)

This is the primary way to grow the catalogue: just ask Claude in Cowork, e.g.
_"add retreat centers in the Bay Area"_ or _"add Green Gulch Farm"_. Claude runs the
whole flow itself. No API key, no `claude` CLI, no terminal.

## What Claude does

Claude acts as an **orchestrator**: it does not do the web research itself — it
delegates every research step to sub-agents (Task tool) and then ingests their output.

1. **Check what already exists (always first).** Before discovering anything, Claude
   reads `data/centers/*.json` and collects every existing center's `name` and `aka`
   values. This list of already-catalogued centers is passed to the discovery sub-agent
   and to every research sub-agent so nothing is duplicated.
2. **Discover — via a sub-agent, not the main agent.** Claude spawns a dedicated
   **discovery sub-agent** (one per region for large areas) that uses web search to find
   real, currently-operating centers in the requested area. Claude gives it the
   exclusion list from step 1 and instructs it to skip (a) any center whose name or
   `aka` already appears in `data/centers/`, (b) pure spas, (c) plain yoga studios
   that don't run retreats, (d) **Christian contemplative centers — Catholic /
   Benedictine / Franciscan / Camaldolese abbeys, monasteries, hermitages, and diocesan
   retreat houses are OUT OF SCOPE and must be excluded**, and (e) **centers whose
   primary focus is yoga training (the physical postures/asana practice) rather than
   meditation — these are OUT OF SCOPE even if they call themselves an "ashram" or
   "retreat center" and even if meditation is offered alongside the yoga classes.** A
   Hindu/yoga-lineage center is only in scope if meditation (not asana/movement) is the
   central practice retreatants come for. Meditation-focused traditions are in scope,
   **including Goenka / Vipassana-Meditation (`dhamma.org`) centers** — tag
   those `goenka`. The discovery sub-agent returns a vetted candidate list (name, city,
   official URL, one-line why).
3. **Write candidates — one research sub-agent per center.** For each *new* candidate,
   Claude spawns a research sub-agent that researches the center from its official site
   and writes `data/_staging/<slug>.json` following the entry spec below. Claude tells
   each sub-agent the exact `id` (slug) to use so it matches the intended filename, and
   reminds it of the exclusion list so it self-aborts if it turns out to duplicate an
   existing entry.
4. **Ingest** — Claude runs `node scripts/ingest-center.mjs` in the sandbox. That script
   validates each entry, registers any new `proposedTags` into `schema/tags.json`,
   writes clean entries to `data/centers/`, clears the staging files, and rebuilds
   `public/data`. If a candidate's slug collides with an existing entry, that is a
   duplicate — skip it rather than overwriting.
5. **Show** — Claude presents the updated site.

> De-duplication is a hard rule: never create a second entry for a center that is
> already in `data/centers/` (check both `name` and `aka`). When in doubt, treat a
> near-match as a duplicate and skip it.

> **One state at a time (hard rule).** When asked to add several states at once
> (e.g. "do Nevada, then Oregon, then Washington"), fully complete ONE state before
> starting the next: discover -> research -> ingest -> add its code to `STATE_NAMES`
> in `app.js` -> update the "Supported states" line (see below) -> verify that state
> renders, and confirm it is done, before moving on. Do not run states in parallel or
> leave a state half-finished.

> **Keep the "Supported states" line current.** `public/index.html` has a
> `#supportedStates` line under the result count, populated in `app.js`
> (`renderCatalogue`) from `Object.keys(STATE_NAMES)` plus any zero-result states
> checked-but-excluded (currently just `NV`) — alphabetized, no per-state annotation.
> Whenever a state is added to `STATE_NAMES`, or a new state is checked and found to
> have zero qualifying centers, update that logic/list so the line stays accurate. It's
> styled to match `.result-count` (small, italic, muted grey) via the `.supported-states`
> CSS class.

## Entry spec (what each staged JSON must contain)

Required: `name`, `location` (`city`, `region`, `state:"CA"`, `lat`, `lng`), `tradition`,
`about`, `tags`. Recommended: everything below.

- `about` — the ONLY paragraph (~3–6 sentences), plain language.
- **Wording:** never write the redundant pair "Insight Meditation (Vipassana)" (or
  "Insight/Vipassana") — the two terms mean the same thing. Pick ONE ("Insight
  Meditation" is preferred for this catalogue) and use it consistently in `tradition`,
  `technique`, `about`, and `influences`. Standalone use of either term is fine.
- `technique`, `teacherAccess`, `retreatOptions`, `schedule`, `cost`, `foodNotes`, `workNotes` — ONE concise line each.
  - `teacherAccess` — access to teachers on retreat (daily Dharma talks, small-group meetings, 1:1 interviews, or none).
  - `retreatOptions` — the range of retreat options / possible lengths of stay (e.g. "daylongs; 5–9 night silent retreats; month-long").
- `pricePerDay` `{ min, max, unit:"night", notes, source }` — a per-night rate for a
  **standard multi-day residential retreat** (use a weeklong option where available),
  dividing the retreat total by nights. **Ignore scholarships, donation floors, and
  day-only events.** Put the exact retreat/registration page URL in `source`. **If, after checking the official site, no price is determinable, OMIT `pricePerDay` entirely** — the site then shows `~$?/night`. Use `null` min/max only for centers that are strictly donation-only with no suggested amount.
  **If the official site publishes an actual per-night (or per-retreat, divisible into
  per-night) dollar figure for its ongoing residential retreat program — not a one-time
  special event — use that real number and do NOT mark the center `dana-donation` or
  describe it as "donation-based," even if the same center separately mentions dana
  for the teacher's compensation, or a different one-off program is by-donation.**
  Dana-for-the-teacher (common at Zen/Insight centers alongside a fixed room-and-board
  fee) is a distinct thing from the retreat itself being donation-based — only use
  `dana-donation`/omit pricing when the *stay* has no set fee.
  - **`notes` must ADD information to `cost` — never restate it.** The detail-page Cost
    row renders the two fields concatenated as `cost · notes`, so if they say the same
    thing in slightly different words the page reads as one sentence repeated twice.
    `notes` exists to explain *how the per-night figure was derived* — the arithmetic
    (e.g. "9-night retreat $2,205–$3,330 ÷ 9 nights"), the exact tiers, the dates, or
    which specific program the rate is drawn from. For donation-only centers where there
    is nothing to derive, keep `notes` to a SHORT, distinct line (e.g. "No suggested
    amount; retreatants give as they are able.") and do NOT re-say the donation/dana
    framing already carried in `cost`. **Check before saving:** `notes` should contain at
    least one concrete fact — a number, tier, date, or source detail — that is NOT already
    in `cost`; if it doesn't, trim or rewrite it. (Bulk audit: compare word overlap of
    `cost` vs `pricePerDay.notes` across `data/centers/*.json` and manually review any
    pair where `notes` adds few or no new content words.)
- `foodServed` and `foodType`. **Use these EXACT enum values verbatim — no other
  strings are valid** (the ingest/build steps and the site depend on them):
  - `foodServed`: one of `yes`, `no`, `partial`, `unknown` (do NOT invent values like
    "all-meals" or "some-meals" — three meals a day is `yes`, some meals is `partial`).
  - `foodType`: one of `vegan`, `vegetarian`, `omnivore`, `mixed`, `unknown`.
  - The diet type shows as a green badge on the "Food served" line — there is no separate diet row.
- `workRequired`: one of `yes`, `no`, `partial`, `unknown` (exact values only).
- `tags` — ids from `schema/tags.json` ONLY. **Be strict: do not invent tags.** Use the
  existing controlled vocabulary; prefer fewer, accurate tags over many. `proposedTags`
  is a rare last resort — propose a NEW tag only when the attribute is (a) genuinely
  reusable across *many* future centers, (b) not already expressible with an existing
  tag, and (c) a stable category, not a one-off descriptor. When in doubt, do NOT propose
  a tag — put the nuance in `about`/`technique` instead. A `proposedTags` entry is
  `{ id, label, group }` (group is one of: tradition, format