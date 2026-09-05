#!/usr/bin/env node
/*
  A small CLI over src/content/resources/, so adding, editing, reordering and
  removing a recommendation is one command instead of hand-editing frontmatter
  across a dozen files and renumbering the rest by hand.

  The expensive part of publishing a resource is deciding what it is: finding
  the canonical URL, the show, the episode number, the date. That is judgment
  and stays with whoever is doing the publishing. Everything after that —
  slugs, `order` numbers, file layout, keeping the numbering contiguous — is
  bookkeeping, and this file owns all of it.

  Zero dependencies, deliberately: it has to run before `npm install` and
  never break because of a version bump. The frontmatter here is a flat map of
  scalars, so a full YAML parser would be more risk than it removes.

    node scripts/resources.mjs help

  Invariant: after every mutating command, `order` is 1..N in exactly the
  sequence the page renders. So the numbers in `list` are also the positions,
  and reordering is a splice.
*/

import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";

const DIR = "src/content/resources";
const PEOPLE_FILE = "src/data/people.ts";

/* The order fields are written in, so files stay diffable against each other.
   Anything not listed here is unknown to the schema and rejected by `check`. */
const FIELDS = [
  "title",
  "url",
  "category",
  "section",
  "group",
  "format",
  "source",
  "byline",
  "episode",
  "published",
  "duration",
  "note",
  "order",
  "added",
];
const REQUIRED = ["title", "url", "category", "format"];
const FORMATS = ["podcast", "article", "newsletter", "group"];
const DATE_FIELDS = ["published", "added"];

// ── frontmatter ───────────────────────────────────────────────────────────

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);

function parse(text, file) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!m) throw new Error(`${file}: no frontmatter block`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) throw new Error(`${file}: cannot parse frontmatter line: ${line}`);
    const [, key, raw] = kv;
    let value = raw.trim();
    if (/^".*"$/s.test(value)) {
      value = value.slice(1, -1).replace(/\\(["\\])/g, "$1");
    } else if (/^-?\d+(\.\d+)?$/.test(value) && !isDate(value)) {
      value = Number(value);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    }
    data[key] = value;
  }
  return { data, body: (m[2] ?? "").replace(/^\r?\n/, "") };
}

function serialise({ data, body }) {
  const lines = [];
  const keys = [
    ...FIELDS.filter(k => data[k] !== undefined && data[k] !== ""),
    ...Object.keys(data).filter(k => !FIELDS.includes(k)),
  ];
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (DATE_FIELDS.includes(key) && isDate(String(value))) {
      // Bare, the way Astro's own date frontmatter is written elsewhere.
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: "${String(value).replace(/(["\\])/g, "\\$1")}"`);
    }
  }
  const rest = body.trim();
  return `---\n${lines.join("\n")}\n---\n${rest ? `\n${rest}\n` : ""}`;
}

// ── loading & ordering ────────────────────────────────────────────────────

function load() {
  const entries = readdirSync(DIR)
    .filter(f => /\.mdx?$/.test(f) && !f.startsWith("_"))
    .map(f => {
      const slug = basename(f).replace(/\.mdx?$/, "");
      const { data, body } = parse(readFileSync(join(DIR, f), "utf8"), f);
      return { slug, file: join(DIR, f), data, body };
    });
  return sorted(entries);
}

/*
  The page nests category > person, and neither level carries its own sort
  key: a category and a person each inherit the lowest `order` beneath them
  (see src/lib/resources.ts). Reproducing that here is what lets one number
  per entry drive the whole arrangement — and what makes `list` show the
  page's real running order rather than a flat sort that splits a person in
  two.
*/
function sorted(entries) {
  const low = (fn, value) =>
    Math.min(...entries.filter(e => fn(e) === value).map(e => e.data.order ?? 0));
  const cat = e => e.data.category ?? "";
  const person = e => `${cat(e)}\u0000${e.data.group ?? ""}`;
  return [...entries].sort(
    (a, b) =>
      low(cat, cat(a)) - low(cat, cat(b)) ||
      cat(a).localeCompare(cat(b)) ||
      low(person, person(a)) - low(person, person(b)) ||
      (a.data.group ?? "").localeCompare(b.data.group ?? "") ||
      (a.data.order ?? 0) - (b.data.order ?? 0) ||
      a.slug.localeCompare(b.slug)
  );
}

/*
  The array's own order is the intent — a splice, or a freshly added entry
  that has no number yet — so it becomes the provisional numbering before the
  tree sort runs. The sort then only repairs grouping (a link moved under a
  person is pulled in beside them), and the result is renumbered 1..N.
  Only files whose text actually changed are rewritten.
*/
function save(entries) {
  entries.forEach((e, i) => (e.data.order = i + 1));
  const list = sorted(entries);
  let changed = 0;
  list.forEach((entry, i) => {
    const order = i + 1;
    const next = serialise({ data: { ...entry.data, order }, body: entry.body });
    if (next !== readSafe(entry.file)) {
      writeFileSync(entry.file, next);
      changed++;
    }
    entry.data.order = order;
  });
  return { list, changed };
}

const readSafe = f => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
};

// ── selectors ─────────────────────────────────────────────────────────────

/*
  One argument, three meanings, because all three are things you want to move:
  a slug (one link), a person's name (their whole block), a category (the lot).
  Resolves to entries in render order, which is what makes a move a splice.
*/
function select(entries, token) {
  const t = token.toLowerCase();
  const bySlug = entries.filter(e => e.slug.toLowerCase() === t);
  if (bySlug.length) return bySlug;
  const byGroup = entries.filter(e => (e.data.group ?? "").toLowerCase() === t);
  if (byGroup.length) return byGroup;
  const byCat = entries.filter(e => (e.data.category ?? "").toLowerCase() === t);
  if (byCat.length) return byCat;
  const partial = entries.filter(e => e.slug.toLowerCase().includes(t));
  if (partial.length === 1) return partial;
  if (partial.length > 1) {
    die(
      `"${token}" matches several entries:\n` +
        partial.map(e => `  ${e.slug}`).join("\n")
    );
  }
  die(`No entry, person or category matches "${token}". Try: list`);
}

// ── helpers ───────────────────────────────────────────────────────────────

const die = msg => {
  console.error(`resources: ${msg}`);
  process.exit(1);
};

const kebab = s =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const today = () => new Date().toISOString().slice(0, 10);

/*
  Mirrors the slugs already in the folder: surname, then the show or
  publication, then the episode number — "shedler-transforming-trauma-143".
  Where that isn't enough to tell two entries apart (two interviews on the
  same show, one of them unnumbered) it falls back to the title, which is.
*/
function makeSlug(data, taken) {
  const surname = kebab((data.group ?? "").split(/\s+/).pop() ?? "");
  const source = kebab(data.source ?? "");
  const episode = String(data.episode ?? "").match(/\d+/)?.[0] ?? "";
  const titleSlug = kebab(data.title).split("-").slice(0, 6).join("-");
  const candidates = [
    [surname, source, episode].filter(Boolean).join("-"),
    [surname, source, episode, titleSlug].filter(Boolean).join("-"),
    [surname, titleSlug].filter(Boolean).join("-"),
    titleSlug,
  ].filter(s => s && s !== surname);
  for (const c of candidates) if (!taken.has(c)) return c;
  const base = candidates[candidates.length - 1] || "resource";
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Split `--flag value` / `--flag=value` off the positional arguments. */
function args(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

const people = () => {
  const src = readSafe(PEOPLE_FILE) ?? "";
  return new Set([...src.matchAll(/^\s*"([^"]+)":\s*"/gm)].map(m => m[1]));
};

// ── commands ──────────────────────────────────────────────────────────────

function cmdList(flags) {
  const entries = load();
  if (flags.json) {
    console.log(
      JSON.stringify(
        entries.map(e => ({ slug: e.slug, ...e.data })),
        null,
        2
      )
    );
    return;
  }
  if (!entries.length) return console.log("No resources yet.");

  const known = people();
  let category = null;
  let group = null;
  for (const e of entries) {
    if (e.data.category !== category) {
      category = e.data.category;
      group = null;
      console.log(`\n${category}`);
    }
    if ((e.data.group ?? "") !== group) {
      group = e.data.group ?? "";
      const hint = group && !known.has(group) ? "   (no link in people.ts)" : "";
      console.log(`  ${group || "(ungrouped)"}${hint}`);
    }
    const meta = [e.data.source, e.data.episode, e.data.published, e.data.duration]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `    ${String(e.data.order).padStart(3)}  ${e.slug.padEnd(46)} ${e.data.format.padEnd(10)} ${meta}`
    );
    if (e.data.note) console.log(`         note: ${e.data.note.slice(0, 72)}…`);
  }
  console.log();
}

function cmdAdd(rest, flags) {
  const source = rest[0] ?? "-";
  const raw =
    source === "-" ? readFileSync(0, "utf8") : readFileSync(source, "utf8");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    die(`could not parse JSON from ${source === "-" ? "stdin" : source}: ${err.message}`);
  }
  const incoming = Array.isArray(payload) ? payload : [payload];

  const entries = load();
  const taken = new Set(entries.map(e => e.slug));
  const urls = new Map(entries.map(e => [e.data.url, e.slug]));
  const added = [];

  for (const item of incoming) {
    const { slug: wanted, after, before, ...data } = item;
    for (const key of REQUIRED) {
      if (!data[key]) die(`"${data.title ?? "(untitled)"}": missing ${key}`);
    }
    if (!FORMATS.includes(data.format)) {
      die(`"${data.title}": format "${data.format}" is not one of ${FORMATS.join(", ")}`);
    }
    for (const key of Object.keys(data)) {
      if (!FIELDS.includes(key)) die(`"${data.title}": unknown field "${key}"`);
    }
    if (urls.has(data.url)) {
      die(`"${data.title}": ${data.url} is already listed as ${urls.get(data.url)}`);
    }
    data.added ??= today();
    delete data.order;

    const slug = wanted ?? makeSlug(data, taken);
    if (taken.has(slug)) die(`"${slug}" already exists`);
    taken.add(slug);
    urls.set(data.url, slug);

    const entry = { slug, file: join(DIR, `${slug}.md`), data, body: "" };
    // Land it beside its own people by default, not at the bottom of the page.
    const anchor =
      (after && select(entries, after).at(-1)) ??
      (before && select(entries, before)[0]) ??
      entries.filter(e => (e.data.group ?? "") === (data.group ?? "")).at(-1) ??
      entries.filter(e => e.data.category === data.category).at(-1);
    const at = anchor
      ? entries.indexOf(anchor) + (before && !after ? 0 : 1)
      : entries.length;
    entries.splice(at, 0, entry);
    added.push(entry);
  }

  const { list } = save(entries);
  for (const e of added) console.log(`added  ${e.slug}  (order ${e.data.order})`);
  console.log(`${list.length} resources total.`);
  if (flags.quiet !== true) cmdCheck({}, entries);
}

function cmdSet(rest) {
  const [token, ...pairs] = rest;
  if (!token || !pairs.length) die("usage: set <slug> field=value [field=value ...]");
  const entries = load();
  const [entry] = select(entries, token);
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) die(`expected field=value, got "${pair}"`);
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!FIELDS.includes(key)) die(`unknown field "${key}"`);
    if (key === "order") die("order is managed for you — use `move` instead");
    if (key === "format" && !FORMATS.includes(value)) {
      die(`format must be one of ${FORMATS.join(", ")}`);
    }
    if (value === "") delete entry.data[key];
    else entry.data[key] = value;
  }
  save(entries);
  console.log(`updated  ${entry.slug}`);
  cmdCheck({}, entries);
}

function cmdMove(rest, flags) {
  const [token] = rest;
  if (!token) die("usage: move <slug|person|category> --after <x> | --before <x> | --first | --last");
  const entries = load();
  const moving = select(entries, token);
  const rem = entries.filter(e => !moving.includes(e));

  let at;
  if (flags.first) at = 0;
  else if (flags.last) at = rem.length;
  else if (flags.after) {
    const anchor = select(rem, String(flags.after)).at(-1);
    at = rem.indexOf(anchor) + 1;
  } else if (flags.before) {
    const anchor = select(rem, String(flags.before))[0];
    at = rem.indexOf(anchor);
  } else die("say where: --after <x>, --before <x>, --first or --last");

  /*
    A move across categories or people that didn't carry those fields along
    would snap straight back on the next sort: the tree, not the number,
    decides where a link sits. --regroup makes "put this under that person"
    mean what it reads as, by adopting the destination's grouping.
  */
  if (flags.regroup) {
    const neighbour = rem[flags.before ? at : at - 1] ?? rem[at];
    if (!neighbour) die("--regroup needs an entry to land next to");
    for (const e of moving) {
      e.data.category = neighbour.data.category;
      if (neighbour.data.group) e.data.group = neighbour.data.group;
      else delete e.data.group;
    }
  }

  rem.splice(at, 0, ...moving);
  save(rem);
  cmdList({});
}

function cmdReorder(rest) {
  const entries = load();
  const wanted = rest.flatMap(t => select(entries, t));
  const seen = new Set();
  const unique = wanted.filter(e => (seen.has(e.slug) ? false : seen.add(e.slug)));
  const missing = entries.filter(e => !seen.has(e.slug));
  if (missing.length) {
    die(
      "reorder needs every entry, so nothing moves by accident. Missing:\n" +
        missing.map(e => `  ${e.slug}`).join("\n")
    );
  }
  save(unique);
  cmdList({});
}

function cmdRemove(rest) {
  if (!rest.length) die("usage: rm <slug> [slug ...]");
  const entries = load();
  const doomed = rest.flatMap(t => select(entries, t));
  for (const e of doomed) {
    unlinkSync(e.file);
    console.log(`removed  ${e.slug}`);
  }
  save(entries.filter(e => !doomed.includes(e)));
}

/*
  What the Zod schema in src/content.config.ts cannot see: the same link
  listed twice, a person with no home on the web, a field that will read
  wrong on the page. Warnings are judgment calls and don't fail; errors do.
*/
function cmdCheck(flags, preloaded) {
  const entries = preloaded ? sorted(preloaded) : load();
  const errors = [];
  const warnings = [];
  const known = people();
  const seenUrl = new Map();

  for (const e of entries) {
    const at = e.slug;
    for (const key of REQUIRED) {
      if (!e.data[key]) errors.push(`${at}: missing required field "${key}"`);
    }
    for (const key of Object.keys(e.data)) {
      if (!FIELDS.includes(key)) errors.push(`${at}: unknown field "${key}"`);
    }
    if (e.data.format && !FORMATS.includes(e.data.format)) {
      errors.push(`${at}: format "${e.data.format}" is not one of ${FORMATS.join(", ")}`);
    }
    try {
      const u = new URL(e.data.url);
      if (!/^https?:$/.test(u.protocol)) errors.push(`${at}: url is not http(s)`);
    } catch {
      errors.push(`${at}: url "${e.data.url}" is not a valid URL`);
    }
    for (const key of DATE_FIELDS) {
      if (e.data[key] && !isDate(String(e.data[key]))) {
        errors.push(`${at}: ${key} should be YYYY-MM-DD, got "${e.data[key]}"`);
      }
    }
    if (seenUrl.has(e.data.url)) {
      errors.push(`${at}: same url as ${seenUrl.get(e.data.url)}`);
    }
    seenUrl.set(e.data.url, at);

    if (e.data.group && !known.has(e.data.group)) {
      warnings.push(`${at}: "${e.data.group}" has no entry in ${PEOPLE_FILE} — the name renders unlinked`);
    }
    if (e.data.format === "podcast" && !e.data.source) {
      warnings.push(`${at}: a podcast with no source shows no show name under the link`);
    }
    if (e.data.format === "article" && !e.data.byline && !e.data.group) {
      warnings.push(`${at}: an article with no byline and no group shows no author`);
    }
    if (e.data.title === e.data.group && !e.data.source) {
      warnings.push(`${at}: title repeats the heading above it and has no source to fall back on`);
    }
    if (e.data.note && /^[a-z]/.test(e.data.note)) {
      warnings.push(`${at}: note starts lowercase — check it is Greg's sentence, verbatim`);
    }
  }

  const orders = entries.map(e => e.data.order);
  if (orders.some((o, i) => o !== i + 1)) {
    warnings.push(`order is not 1..${entries.length} in render order — run: npm run resources -- renumber`);
  }

  for (const w of warnings) console.warn(`warn   ${w}`);
  for (const e of errors) console.error(`error  ${e}`);
  if (!errors.length && !warnings.length) {
    console.log(`${entries.length} resources, no problems.`);
  }
  if (errors.length && !flags.soft) process.exit(1);
}

function cmdHelp() {
  console.log(`
Manage the /resources list. Run from the repo root.

  npm run resources -- <command>

  list [--json]                 Show the page's running order, with slugs
  add <file.json|->             Create entries from JSON (object or array)
  set <slug> field=value ...    Edit fields; field= (empty) clears one
  move <what> --after <x>       Reposition; also --before, --first, --last
       [--regroup]              …and adopt the destination's category/group
  reorder <what> <what> ...     Rewrite the whole running order
  rm <slug> ...                 Delete entries
  renumber                      Rewrite order to 1..N in render order
  check [--soft]                Validate beyond the Zod schema

<what> is a slug, a person's name, or a category name. A person or a
category moves as one block. Names with spaces need quoting.

add JSON fields — title, url, category, format required; the rest optional:
  title url category section group format source byline episode published
  duration note
  format is one of: ${FORMATS.join(", ")}
  dates are YYYY-MM-DD; \`added\` defaults to today; \`order\` is managed
  \`slug\`, \`after\` and \`before\` may be set per item to place it

Examples:
  npm run resources -- add - <<'JSON'
  [{ "title": "…", "url": "https://…", "category": "Psychotherapy",
     "group": "Jonathan Shedler", "format": "podcast", "source": "…" }]
  JSON
  npm run resources -- move "Jon Frederickson" --before "Jonathan Shedler"
  npm run resources -- set shedler-substack note="…"
`);
}

// ── entry point ───────────────────────────────────────────────────────────

const [, , command = "help", ...argv] = process.argv;
const { flags, rest } = args(argv);

try {
  switch (command) {
    case "list": cmdList(flags); break;
    case "add": cmdAdd(rest, flags); break;
    case "set": cmdSet(rest); break;
    case "move": cmdMove(rest, flags); break;
    case "reorder": cmdReorder(rest); break;
    case "rm":
    case "remove": cmdRemove(rest); break;
    case "renumber": {
      const { changed, list } = save(load());
      console.log(`renumbered ${list.length} resources, ${changed} file(s) rewritten.`);
      break;
    }
    case "check": cmdCheck(flags); break;
    case "help":
    case "--help":
    case "-h": cmdHelp(); break;
    default:
      console.error(`resources: unknown command "${command}"`);
      cmdHelp();
      process.exit(1);
  }
} catch (err) {
  die(err.message);
}
