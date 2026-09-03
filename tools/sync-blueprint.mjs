#!/usr/bin/env node
/**
 * Sync the vendored blueprint dataset from upstream.
 *
 * The data in `src/data` is a verbatim copy of the upstream `data/` directory. It
 * was previously copied in by hand with no record of the source commit, which meant
 * working out what a refresh had changed required diffing against a fresh clone and
 * reading upstream's history — exactly the archaeology this script exists to avoid.
 *
 * Default is a dry run. The interesting output is not the file count but the
 * question-count comparison: a change to the number or order of questions in any
 * capability invalidates stored `questionIndex` values, and needs a migration in
 * `src/services/blueprintRevision.ts` plus a Dexie version bump. The script refuses
 * to write in that case unless told to proceed, because copying the files in and
 * shipping is the one sequence that silently corrupts user ratings.
 *
 *   node tools/sync-blueprint.mjs                    report what would change
 *   node tools/sync-blueprint.mjs --write            apply (blocked if indices move)
 *   node tools/sync-blueprint.mjs --write --allow-index-changes
 *                                                    apply anyway; you have written
 *                                                    the migration
 *   node tools/sync-blueprint.mjs --ref <git-ref>    pin a specific upstream ref
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM = "https://github.com/nickarrow/mita-open-blueprint.git";
const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = join(REPO_ROOT, "src", "data");
const REVISION_FILE = join(REPO_ROOT, "src", "constants", "blueprint.ts");

const args = process.argv.slice(2);
const write = args.includes("--write");
const allowIndexChanges = args.includes("--allow-index-changes");
const refIndex = args.indexOf("--ref");
const ref = refIndex !== -1 ? args[refIndex + 1] : "main";

/** Recursively list files under `dir`, as paths relative to it. */
function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  };
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  walk(dir);
  return out.sort();
}

/**
 * Map of `process_id` -> question count, read from a dataset's BCM files.
 *
 * Keyed on `process_id`, deliberately not on the filename. This very change set is the
 * counterexample: upstream renamed two BCM files, so a filename-keyed comparison sees
 * four distinct keys (two gone, two new) instead of two capabilities, and skips the
 * count comparison for them entirely. A future rename that also moved a question count
 * would sail through the one gate that exists to catch it. `process_id` is stable across
 * renames by design — it is why the app pairs on it.
 */
function questionCounts(dataDir) {
  const counts = new Map();
  for (const rel of listFiles(dataDir)) {
    if (!rel.startsWith(`bcm/`) || !rel.endsWith(".json")) continue;
    const json = JSON.parse(readFileSync(join(dataDir, rel), "utf8"));
    // Older vendored copies predate process_id; fall back to the filename so a sync
    // *from* that state still reports something useful rather than crashing.
    const key = json.process_id ?? rel.split("/").pop().replace(/_BCM_v.*$/, "");
    counts.set(key, json.maturity_model.capability_questions.length);
  }
  return counts;
}

const scratch = mkdtempSync(join(tmpdir(), "mita-blueprint-"));
let exitCode = 0;
try {
  console.log(`Cloning ${UPSTREAM} at ${ref} ...`);
  // Clone then checkout, rather than `clone --branch <ref>`. `--branch` accepts only a
  // branch or tag name, so it cannot take the commit SHA recorded in
  // BLUEPRINT_SOURCE_COMMIT — meaning the pinned commit could not be re-fetched with the
  // documented flag. A full clone is a few MB and makes any ref checkoutable.
  execFileSync("git", ["clone", "--quiet", UPSTREAM, scratch], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  execFileSync("git", ["-C", scratch, "checkout", "--quiet", ref], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const commit = execFileSync("git", ["-C", scratch, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const commitDate = execFileSync("git", ["-C", scratch, "log", "-1", "--format=%cs"], {
    encoding: "utf8",
  }).trim();
  const upstreamData = join(scratch, "data");

  const before = listFiles(DATA_DIR);
  const after = listFiles(upstreamData);
  const added = after.filter((f) => !before.includes(f));
  const removed = before.filter((f) => !after.includes(f) && f !== "NOTICE.md");
  const changed = after.filter(
    (f) =>
      before.includes(f) &&
      !readFileSync(join(DATA_DIR, f)).equals(readFileSync(join(upstreamData, f)))
  );

  console.log(`\nUpstream commit : ${commit} (${commitDate})`);
  console.log(`Files added     : ${added.length}`);
  console.log(`Files removed   : ${removed.length}`);
  console.log(`Files changed   : ${changed.length}`);
  for (const f of [...added.map((f) => `  + ${f}`), ...removed.map((f) => `  - ${f}`)]) {
    console.log(f);
  }

  const oldCounts = questionCounts(DATA_DIR);
  const newCounts = questionCounts(upstreamData);
  const shifted = [];
  for (const [code, count] of newCounts) {
    const previous = oldCounts.get(code);
    if (previous !== undefined && previous !== count) shifted.push({ code, previous, count });
  }
  const newCodes = [...newCounts.keys()].filter((c) => !oldCounts.has(c));
  const goneCodes = [...oldCounts.keys()].filter((c) => !newCounts.has(c));

  console.log(`\nCapabilities    : ${oldCounts.size} -> ${newCounts.size}`);
  if (newCodes.length) console.log(`  new   : ${newCodes.join(", ")}`);
  if (goneCodes.length) console.log(`  gone  : ${goneCodes.join(", ")}`);

  const currentRevision =
    readFileSync(REVISION_FILE, "utf8").match(/BLUEPRINT_REVISION = "([^"]+)"/)?.[1] ?? "unknown";

  if (shifted.length > 0) {
    console.log(`\nQUESTION COUNTS MOVED in ${shifted.length} capabilit(ies):`);
    for (const s of shifted) console.log(`  ${s.code}: ${s.previous} -> ${s.count}`);
    console.log(
      `\nStored ratings identify their question by array position, so this\n` +
        `invalidates existing answers for those capabilities. Before shipping:\n` +
        `  1. Determine what upstream inserted or removed, and where.\n` +
        `  2. Add a CapabilityIndexShift for each, in src/services/blueprintRevision.ts.\n` +
        `  3. Bump BLUEPRINT_REVISION and add a Dexie version with an upgrade.\n` +
        `  4. Re-run with --write --allow-index-changes.\n` +
        `Current BLUEPRINT_REVISION is "${currentRevision}".`
    );
    if (write && !allowIndexChanges) {
      console.error("\nRefusing to write. Pass --allow-index-changes once a migration exists.");
      exitCode = 2;
    }
  } else {
    console.log("\nNo question counts moved. Stored ratings remain valid.");
  }

  if (write && exitCode === 0) {
    // Copy over the tree, then prune what upstream no longer ships.
    //
    // Not `rmSync` followed by `cpSync`: that empties src/data before writing anything,
    // so a failure in between leaves the dataset gone and NOTICE.md — held only in memory
    // — unwritten. Copying first means the working tree is never in a state worse than
    // "some new files, some old".
    cpSync(upstreamData, DATA_DIR, { recursive: true });
    for (const rel of removed) {
      rmSync(join(DATA_DIR, rel), { force: true });
    }
    console.log(`\nWrote ${after.length} files to src/data.`);
    console.log(
      `Now update src/data/NOTICE.md and BLUEPRINT_SOURCE_COMMIT in\n` +
        `src/constants/blueprint.ts to commit ${commit}.`
    );
  } else if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.exit(exitCode);
