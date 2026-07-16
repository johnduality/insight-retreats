#!/usr/bin/env node
/**
 * ingest-center.mjs — Cowork-native ingest for new retreat-center entries.
 *
 * Claude (in Cowork) researches a center, writes a candidate JSON into
 * data/_staging/, then runs this script. It validates the entry against the
 * schema + tag vocabulary, registers any ad-hoc `proposedTags` into the master
 * schema/tags.json, drops Goenka / dhamma.org centers, writes the clean entry to
 * data/centers/<id>.json, and rebuilds public/data.
 *
 * Usage:
 *   node scripts/ingest-center.mjs                 # ingest every file in data/_staging/
 *   node scripts/ingest-center.mjs path/to.json    # ingest specific file(s)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tagsPath = join(root, "schema", "tags.json");
const schema = JSON.parse(readFileSync(join(root, "schema", "entry.schema.json"), "utf8"));
const tags = JSON.parse(readFileSync(tagsPath, "utf8"));
const tagSet = new Set(tags.groups.flatMap((g) => g.tags.map((t) => t.id)));

const EXCLUDE = []; // no auto-exclusions (Goenka / dhamma.org centers are now included)

// Manual transliteration for characters NFKD decomposition doesn't strip
// (Nordic/Slavic letters etc.) so international names produce readable slugs
// instead of silently dropping letters (e.g. "Zengarden" -> "zeng-rden" bug).
const TRANSLIT = {
  "ø": "o", "Ø": "O", "å": "a", "Å": "A", "æ": "ae", "Æ": "AE",
  "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ß": "ss",
  "ð": "d", "Ð": "D", "þ": "th", "Þ": "Th",
};
const TRANSLIT_RE = /[øØåÅæÆłŁđĐßðÐþÞ]/g;
const slugify = (s) =>
  s
    .replace(TRANSLIT_RE, (c) => TRANSLIT[c] || c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function registerProposedTags(proposed) {
  const added = [];
  for (const p of proposed || []) {
    if (!p || !p.id) continue;
    const id = slugify(p.id);
    if (!id || tagSet.has(id)) continue;
    const groupId = p.group && tags.groups.some((g) => g.id === p.group) ? p.group : "practical";
    tags.groups.find((g) => g.id === groupId).tags.push({ id, label: (p.label || id).slice(0, 60) });
    tagSet.add(id);
    added.push(id);
  }
  if (added.length) writeFileSync(tagsPath, JSON.stringify(tags, null, 2) + "\n");
  return added;
}

function validate(e) {
  const problems = [];
  for (const key of schema.required) if (!(key in e)) problems.push(`missing "${key}"`);
  if (e.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) problems.push(`bad id "${e.id}"`);
  if (e.location && (typeof e.location.lat !== "number" || typeof e.location.lng !== "number"))
    problems.push("location.lat/lng must be numbers");
  for (const t of e.tags || []) if (!tagSet.has(t)) problems.push(`unknown tag "${t}"`);
  return problems;
}

const args = process.argv.slice(2);
const stagingDir = join(root, "data", "_staging");
const files = args.length
  ? args
  : existsSync(stagingDir)
    ? readdirSync(stagingDir).filter((f) => f.endsWith(".json")).map((f) => join(stagingDir, f))
    : [];

if (!files.length) {
  console.log("No candidate files. Put JSON entries in data/_staging/ or pass paths as args.");
  process.exit(0);
}

let written = 0;
for (const file of files) {
  const entry = JSON.parse(readFileSync(file, "utf8"));
  const label = entry.name || file;

  const hay = `${entry.name} ${entry.website} ${entry.tradition}`;
  if (EXCLUDE.some((re) => re.test(hay))) {
    console.log(`skipped ${label}: excluded (Goenka / out of scope)`);
    continue;
  }

  entry.id = entry.id || slugify(entry.name);
  if (entry.location) entry.location.state = entry.location.state || "CA";
  entry.meta = {
    generatedBy: "claude (cowork)",
    lastUpdated: new Date().toISOString().slice(0, 10),
    reviewStatus: "unverified",
    ...entry.meta,
  };

  const added = registerProposedTags(entry.proposedTags);
  if (added.length) console.log(`  + new tag(s): ${added.join(", ")}`);
  delete entry.proposedTags;

  const problems = validate(entry);
  if (problems.length) {
    console.log(`INVALID ${label}: ${problems.join("; ")}`);
    continue;
  }

  writeFileSync(join(root, "data", "centers", `${entry.id}.json`), JSON.stringify(entry, null, 2) + "\n");
  console.log(`ok ${label} -> data/centers/${entry.id}.json`);
  if (args.length === 0) {
    try { rmSync(file); } catch { /* mount may return EPERM on unlink; log to deletions.txt by hand */ }
  }
  written++;
}

if (written) {
  execFileSync("node", [join(root, "scripts", "build-data.mjs")], { stdio: "inherit" });
  console.log(`\nIngested ${written} center(s). public/data rebuilt.`);
}
