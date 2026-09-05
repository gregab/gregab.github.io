/*
  Resolving a book cover from Open Library.

  This is the single implementation of that lookup. It is imported by the
  runtime lookup in CuriosityTimeline.astro (which runs in the visitor's
  browser) and by scripts/covers.mjs (which runs it once, offline, and bakes
  the results into src/data/curiosity.ts). Keeping one copy is the point:
  there used to be two, they drifted, and only one of them had a fallback.

  Plain .mjs with JSDoc rather than .ts so the Node script can import it
  directly, the same zero-ceremony choice scripts/resources.mjs makes.

  ---------------------------------------------------------------------------
  Why the naive query fails, since it is not obvious and it cost a bug:

  Open Library's `author=` filter matches against a work's *individual* author
  names. The timeline stores a display byline — "V. S. Ramachandran and Sandra
  Blakeslee", "Gilles Deleuze and Félix Guattari" — which is not any one
  author's name, matches no author record, and returns nothing. Six of the
  entries in curiosity.ts are bylines like that, and every one of them was
  showing a placeholder. So the byline is narrowed to a single searchable name
  before it is ever sent.

  The second failure is subtler: asking for `limit=1` and reading `docs[0]`
  gives up whenever Open Library's top-ranked edition happens to have no cover
  scanned, even though the third or fourth does. So ask for a page of results
  and take the first that actually has one.

  A note for whoever changes this: public/tools/curiosity-timeline.html runs
  the same ladder against the same API. It is deliberately a single
  self-contained file with no imports, so it carries its own copy. Change one,
  change the other.
*/

const SEARCH_URL = "https://openlibrary.org/search.json";
const COVER_BASE = "https://covers.openlibrary.org/b/id/";

/** Fields worth asking for. Smaller responses, and Open Library prefers it. */
const FIELDS = "cover_i,title,author_name";

/** One page of results is plenty to find a doc that has a cover. */
const LIMIT = 10;

/**
 * Narrow a display byline to one name Open Library can actually match.
 *
 *   "V. S. Ramachandran and Sandra Blakeslee" -> "V. S. Ramachandran"
 *   "Gilles Deleuze and Félix Guattari"       -> "Gilles Deleuze"
 *   "Culadasa (John Yates)"                   -> "Culadasa"
 *   "Henry David Thoreau"                     -> "Henry David Thoreau"
 *
 * Only the first author is kept. Open Library indexes every author of a work,
 * so matching one is enough, and it avoids inventing a name that belongs to
 * nobody.
 *
 * @param {string | undefined} displayAuthor
 * @returns {string} a single name, or "" when there is nothing usable
 */
export function searchAuthor(displayAuthor) {
  if (!displayAuthor) return "";
  return (
    displayAuthor
      // "Culadasa (John Yates)" — the parenthetical is a gloss, not a name.
      .replace(/\([^)]*\)/g, " ")
      // Cut at the first thing that separates one author from the next.
      .split(/\s+and\s+|\s*&\s*|\s*,\s*|\s*;\s*|\s+with\s+|\s*\/\s*/i)[0]
      .replace(/\bet\s+al\.?/i, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * The image URL for a cover id.
 *
 * `default=false` matters: without it Open Library answers a missing cover
 * with a 1×1 blank GIF, which loads successfully and paints an empty box over
 * our drawn placeholder. With it the request 404s, the <img> fires onerror,
 * and the placeholder survives.
 *
 * @param {number} coverId
 * @param {"S" | "M" | "L"} [size]
 * @returns {string}
 */
export function coverUrl(coverId, size = "M") {
  return `${COVER_BASE}${coverId}-${size}.jpg?default=false`;
}

/**
 * @typedef {object} CoverQuery
 * @property {string} title
 * @property {string} [author] display byline; narrowed before it is sent
 * @property {string} [lookup] overrides the title when title+author can't find it
 */

/**
 * @typedef {object} CoverResult
 * @property {boolean} ok false only for a transport failure — the caller
 *   should retry later rather than record "no cover".
 * @property {string} url the cover image URL, or "" for a clean miss
 * @property {string} [via] which attempt found it, for the script's log
 */

/**
 * Build the ladder of queries to try, most specific first.
 *
 * @param {CoverQuery} entry
 * @returns {Array<{ via: string, params: Record<string, string> }>}
 */
function attempts(entry) {
  // `||`, not `??`: a caller that reads these fields out of a file hands back
  // "" for an absent `lookup`, and `??` would accept that empty string as the
  // title and search for nothing at all.
  const title = (entry.lookup || entry.title || "").trim();
  // A `lookup` override is a hand-written correction for a title the byline
  // was fighting; don't then re-attach the byline it was written to escape.
  const author = entry.lookup ? "" : searchAuthor(entry.author);
  if (!title) return [];

  /** @type {Array<{ via: string, params: Record<string, string> }>} */
  const list = [];
  if (author) list.push({ via: "title+author", params: { title, author } });
  list.push({ via: "title", params: { title } });
  // Last resort: general search, which will match subtitles and series
  // volumes that the strict title field will not.
  list.push({ via: "q", params: { q: author ? `${title} ${author}` : title } });
  return list;
}

/**
 * Find a cover for one entry, trying progressively looser queries.
 *
 * @param {CoverQuery} entry
 * @param {object} [options]
 * @param {typeof globalThis.fetch} [options.fetch] injectable for tests
 * @param {number} [options.timeoutMs]
 * @returns {Promise<CoverResult>}
 */
export async function findCover(entry, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  let transportFailed = false;

  for (const attempt of attempts(entry)) {
    const params = new URLSearchParams({
      ...attempt.params,
      limit: String(LIMIT),
      fields: FIELDS,
    });

    let data;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${SEARCH_URL}?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          // 4xx/5xx is the service talking, not a verdict on this book.
          transportFailed = true;
          continue;
        }
        data = await res.json();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      transportFailed = true;
      continue;
    }

    // Take the first doc that actually has a cover, not merely the first doc.
    const docs = Array.isArray(data?.docs) ? data.docs : [];
    const hit = docs.find(doc => typeof doc?.cover_i === "number");
    if (hit) return { ok: true, url: coverUrl(hit.cover_i), via: attempt.via };
  }

  // Every attempt ran and none matched: a real miss, safe to remember.
  // Unless the network was the reason, in which case it isn't.
  return { ok: !transportFailed, url: "" };
}
