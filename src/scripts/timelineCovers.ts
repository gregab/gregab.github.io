/*
  Runtime Open Library cover lookup for the 2D timeline — the fallback, not
  the plan.

  `npm run covers` resolves covers offline and writes them into
  src/data/curiosity.ts, and a baked-in `cover` skips this entirely. This
  exists so an entry Greg adds without running the script still gets a cover
  instead of a placeholder. The query ladder lives in src/lib/openlibrary.mjs,
  shared with that script, because two copies of it drifted once already; the
  browser cache lives in src/lib/coverCache.ts, shared with the 3D corridor,
  for the same reason.

  It is a module rather than the timeline's own <script> because the
  corridor renders the timeline inside a <template> and swaps it in when
  WebGL is missing — after page-load, and where a component script would be
  inert — so the corridor imports and calls this directly.

  Every fetch call is wrapped: a blocked or flaky network can never throw
  past this, and the drawn placeholder is always a safe landing.
*/
import { findCover } from "@/lib/openlibrary.mjs";
import {
  evictOldCoverCaches,
  readCoverCache,
  writeCoverCache,
} from "@/lib/coverCache";

const CONCURRENCY = 4;

function applyCover(cover: HTMLElement, url: string): void {
  const img = cover.querySelector("img");
  if (!img) return;
  img.onerror = () => img.removeAttribute("src");
  img.src = url;
}

async function worker(queue: HTMLElement[]): Promise<void> {
  let item: HTMLElement | undefined;
  while ((item = queue.shift())) {
    const key = item.dataset.coverKey;
    const title = item.dataset.coverQueryTitle;
    const author = item.dataset.coverQueryAuthor ?? "";
    const lookup = item.dataset.coverQueryLookup;
    if (!key || !title) continue;

    const cached = readCoverCache(key);
    if (cached) {
      if (cached.url) applyCover(item, cached.url);
      continue;
    }

    const result = await findCover({ title, author, lookup });
    // A transport failure is not evidence the book has no cover, so it is
    // not written down — the next visit tries again.
    if (!result.ok) continue;
    writeCoverCache(key, result.url);
    if (result.url) applyCover(item, result.url);
  }
}

/** Fill every unresolved `.ct-cover` on the page. Safe to call repeatedly. */
export function resolveTimelineCovers(): void {
  const covers = document.querySelectorAll<HTMLElement>(
    ".ct-cover[data-cover-key]:not([data-ct-resolved])"
  );
  if (covers.length === 0) return;

  evictOldCoverCaches();

  const queue: HTMLElement[] = [];
  covers.forEach(cover => {
    cover.dataset.ctResolved = "1";
    queue.push(cover);
  });

  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));
  void Promise.all(workers);
}
