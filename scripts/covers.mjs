#!/usr/bin/env node
/*
  Bakes Open Library cover URLs into src/data/curiosity.ts.

  The timeline can look covers up in the visitor's browser, but that is the
  fallback, not the plan: it costs every visitor a burst of API calls, it is
  at the mercy of Open Library being reachable at that moment, and a book it
  can't find shows a placeholder to everyone forever. Resolving once, here,
  and committing the URLs makes the page static again.

    npm run covers            # fill in entries that have no cover
    npm run covers -- --check # report what is missing, write nothing
    npm run covers -- --force # re-resolve every entry, including baked ones

  The query ladder is in src/lib/openlibrary.mjs, shared with the runtime
  lookup, so the two cannot disagree about what "not found" means.

  Zero dependencies, like scripts/resources.mjs. The data file is edited by
  string surgery rather than parsed and re-serialised, so Greg's comments,
  ordering and formatting survive untouched — the only lines this ever writes
  are `cover:` lines.
*/

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { findCover, searchAuthor } from "../src/lib/openlibrary.mjs";

const DATA_FILE = path.join(process.cwd(), "src", "data", "curiosity.ts");

/** Open Library asks for one request at a time from scripts. Be a good guest. */
const DELAY_MS = 350;

const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const FORCE = args.has("--force");

/*
  One entry is the block from `  {` to its closing `  },`. The file is
  prettier-formatted and the objects have no nested braces, so this is exact
  rather than hopeful — and if that ever stops being true, the count check
  below fails loudly instead of corrupting the file.
*/
const BLOCK_RE = /^ {2}\{\n(?: {4}.*\n)+ {2}\},$/gm;

/** @param {string} block @param {string} field */
function readField(block, field) {
  const m = block.match(
    new RegExp(`^ {4}${field}: "((?:[^"\\\\]|\\\\.)*)",$`, "m")
  );
  return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
}

/** @param {string} value */
function quote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Put the cover line just after `url:`, where it reads naturally, or before
 * the closing brace if there is no url line to anchor to.
 * @param {string} block @param {string} url
 */
function withCover(block, url) {
  const line = `    cover: ${quote(url)},`;
  if (/^ {4}cover: /m.test(block)) {
    return block.replace(/^ {4}cover: .*$/m, line);
  }
  if (/^ {4}url: .*$/m.test(block)) {
    return block.replace(/^( {4}url: .*)$/m, `$1\n${line}`);
  }
  return block.replace(/^ {2}\},$/m, `${line}\n  },`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Cannot find ${DATA_FILE}. Run this from the project root.`);
    process.exit(1);
  }

  const source = fs.readFileSync(DATA_FILE, "utf8");
  const blocks = source.match(BLOCK_RE) ?? [];

  if (blocks.length === 0) {
    console.error(
      "Parsed 0 entries out of curiosity.ts. The file's formatting has " +
        "changed in a way this script does not understand; fix BLOCK_RE " +
        "rather than letting it write to a file it cannot read."
    );
    process.exit(1);
  }

  const entries = blocks.map(block => ({
    block,
    title: readField(block, "title"),
    author: readField(block, "author"),
    lookup: readField(block, "lookup"),
    cover: readField(block, "cover"),
  }));

  const todo = entries.filter(e => FORCE || !e.cover);
  console.log(
    `${entries.length} entries, ${entries.length - todo.length} already have a cover, ` +
      `${todo.length} to resolve.`
  );

  if (CHECK) {
    todo.forEach(e => {
      const via = searchAuthor(e.author);
      console.log(
        `  missing: ${e.title}${via ? `  (would search author "${via}")` : ""}`
      );
    });
    return;
  }
  if (todo.length === 0) return;

  let updated = source;
  let found = 0;
  const missed = [];
  const failed = [];

  for (const entry of todo) {
    const result = await findCover(entry);

    if (!result.ok) {
      // Network trouble, not a verdict on the book. Say so, and leave the
      // entry alone so a later run retries it.
      failed.push(entry.title);
      console.log(`  ?  ${entry.title} — lookup failed (network)`);
    } else if (result.url) {
      const replacement = withCover(entry.block, result.url);
      if (updated.includes(entry.block)) {
        updated = updated.replace(entry.block, replacement);
        found++;
        console.log(`  ✓  ${entry.title}  [${result.via}]`);
      } else {
        // Two identical blocks would make replace() ambiguous. Refuse.
        failed.push(entry.title);
        console.log(
          `  !  ${entry.title} — could not locate its block uniquely`
        );
      }
    } else {
      missed.push(entry.title);
      console.log(`  ·  ${entry.title} — no cover on Open Library`);
    }

    await sleep(DELAY_MS);
  }

  if (found > 0) {
    fs.writeFileSync(DATA_FILE, updated);
    console.log(
      `\nWrote ${found} cover${found === 1 ? "" : "s"} into ${path.relative(process.cwd(), DATA_FILE)}.`
    );
  } else {
    console.log("\nNothing to write.");
  }

  if (missed.length) {
    console.log(
      `\n${missed.length} with no cover in Open Library. Add a \`lookup\` to ` +
        `retry under a different title, or paste a \`cover\` URL by hand:`
    );
    missed.forEach(t => console.log(`  ${t}`));
  }
  if (failed.length) {
    console.log(`\n${failed.length} could not be checked; re-run to retry:`);
    failed.forEach(t => console.log(`  ${t}`));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
