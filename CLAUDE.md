# gregbigelow.com

Astro 7 site (Tailwind 4 via `@tailwindcss/vite`, built on the AstroPaper theme),
deployed to GitHub Pages at https://www.gregbigelow.com via
`.github/workflows/deploy.yml`. Pushing to `main` deploys. A failed build leaves
the previous site live.

## Content staging folder — read this first

Greg drafts website content in Obsidian, in this folder:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Master Vault/Website/
```

When he says something like "I updated the bio, push it" or "there's a new essay
in the folder", that is the folder he means. Read from it, convert what's there
into the right place in `src/`, and deploy.

| Staging path          | Destination                          |
|-----------------------|--------------------------------------|
| `bio.md`              | the bio section of `src/pages/index.astro` |
| `Essays/*.md`         | `src/content/essays/`                |
| `Books/*.md`          | `src/content/books/`                 |
| `Resources/*.md`      | `src/content/resources/`             |
| `Notes for Claude.md` | context and todos — never published  |

Greg writes prose only. Frontmatter, filenames, slugs and dates are yours to
generate against the schemas in `src/content.config.ts`. Expect Obsidian syntax
(`[[wikilinks]]`, `![[embeds]]`, `> [!callout]`, Dataview) and convert it to
portable markdown.

**Rules:**

- **Only ever read the `Website/` subfolder.** Everything else in the vault is
  private and off-limits. Don't read it, don't summarize it, don't reference it.
  This repo is public.
- **Publish only what Greg names.** There is no automatic sync and no publish flag.
  A file sitting in the staging folder is not consent to publish it; he may be
  mid-draft. If scope is ambiguous, ask.
- **One-way.** Never write back into the vault.
- **Proofread before publishing.** Greg drafts fast and expects the publish step
  to catch what he missed. Fix outright errors (typos, missing words, broken
  grammar, wrong proper nouns) as part of the same change and say what you
  changed. Flag judgment calls about voice or fact rather than silently
  "improving" them — his sentence fragments and rhythm are style, not mistakes.

## What is public right now

The site is deliberately minimal: the homepage bio and `/tools`. Everything else
is **parked, not deleted** — Greg wants to publish those sections when he has real
content, so the code and schemas all still exist.

Parking uses Astro's own convention: a leading `_` excludes a file or directory
from routing, and the collection globs (`**/[^_]*.{md,mdx}`) exclude `_`-prefixed
content. To bring a section back, drop the underscore and re-add its nav item in
`src/components/Header.astro`.

| Parked | Path |
|--------|------|
| Essays / writing | `src/pages/_writing/` |
| Books | `src/pages/_books/` |
| Resources | `src/pages/_resources/` |
| About | `src/pages/_about.astro`, `src/content/pages/_about.md` |
| Tags, archives, search | `src/pages/_tags/`, `_archives/`, `_search.astro` |
| RSS feed | `src/pages/_rss.xml.ts` |
| Placeholder content | `_`-prefixed files under `src/content/*/` |

`features.showArchives` and `features.search` are `false` in
`astro-paper.config.ts` to match. Layout's RSS autodiscovery tag was removed
while the feed is parked — restore it when `_rss.xml.ts` comes back, since
advertising a feed that 404s is worse than advertising none.

**No contact address is published.** Greg does not want his personal Gmail on a
public page. `socials` in `astro-paper.config.ts` has a commented placeholder for
a future alias on this domain. Don't add a personal address back.

## Working on the site

```bash
npm run dev     # localhost:4321, hot reload — use this for design iteration
npm run build   # astro check && astro build && pagefind --site dist
                 # must pass before pushing; strict Zod schemas fail the build on bad frontmatter
```

- Essays live in `src/content/essays/` and are served at `/writing/<slug>` (not
  AstroPaper's default `/posts/`) — routes live under `src/pages/writing/`.
  `books` and `resources` are separate content collections with their own schemas;
  all four collections (`essays`, `pages`, `books`, `resources`) are defined in
  `src/content.config.ts`.
- **Tools** are self-contained HTML in `public/tools/`. `src/lib/tools.ts` discovers
  them at build time by parsing each file's `<title>` and `<meta name="description">`.
  Dropping a file in is the whole workflow — there is no manifest to update.
  Two gotchas, both already fixed and both easy to reintroduce:
  - It resolves the directory from `process.cwd()`, **not** from `import.meta.url`.
    The module-relative path works in `astro dev` but points at a bundled chunk
    during `astro build`, which silently produces an empty tool list.
  - Renaming a tool leaves a redirect stub at the old filename so existing links
    survive. `tools.ts` skips any file containing an `http-equiv="refresh"`, so
    stubs don't appear as extra tools.
- **Substack** posts are a hand-maintained list in `src/data/substack.ts`. No RSS fetch.
  It's rendered on `/writing` alongside the essay list.
- **Theme palette** (light and dark) lives in `src/styles/theme.css` as CSS custom
  properties, registered with Tailwind 4 via `@theme inline`. The toggle in the
  header persists the choice in `localStorage` (`src/scripts/theme.ts`).

### Design language — deliberate choices, don't undo them by accident

- **Ink is warm brown (`#2b2320`), not near-black.** This is what makes the site
  read warm; it is not a mistake to "correct".
- **`--accent` (slate blue) is the only cool value.** It exists so the page
  doesn't slide into sepia. Use it for focus rings and small UI, not for links.
- **Links take a highlighter, not a colour.** The `marked` utility in
  `global.css` draws an amber marker swipe that grows on hover; `active-nav`
  is the same mark held open. Apply `marked` to *text* links only — it looks
  like a stray underline under icon-only links, which is why `LinkButton`
  does not apply it by default.
- **No filled buttons anywhere.** Bordered or text-only.
- **Fonts:** Newsreader for headings and body (one family, so the page has one
  voice), IBM Plex Sans for chrome only, IBM Plex Mono for code and tools.
  Newsreader must keep a `ttf` in its `formats` — satori renders the OG images
  and cannot parse woff2 (`src/utils/getFontPathByWeight.ts` skips woff2).
- **Search** is static, via Pagefind (`astro-paper.config.ts` → `features.search`).
  It only works after a production build — `public/pagefind/` is generated by
  `npm run build` and is gitignored.
- Site-wide config (title, author, socials, feature flags) lives in
  `astro-paper.config.ts`, not scattered across components.

## Deployment facts

- Repo `gregab/gregab.github.io`, Pages source is **GitHub Actions** (not branch-based).
- Custom domain lives in `public/CNAME`; DNS is Cloudflare (grey-cloud / DNS-only —
  proxying breaks GitHub's cert issuance).
- Greg does not want to review diffs before they land. Commit and push completed
  work directly; don't ask for approval on ordinary changes.
