# gregbigelow.com

Greg Bigelow's personal website: writing, tools, resources, and book notes.
Built with [Astro](https://astro.build) 7 and Tailwind CSS 4, on top of the
[AstroPaper](https://github.com/satnaing/astro-paper) theme. Deployed to
GitHub Pages at [www.gregbigelow.com](https://www.gregbigelow.com).

## Running locally

```bash
npm install
npm run dev      # http://localhost:4321, hot-reloading
npm run build    # astro check && astro build && pagefind --site dist
npm run preview  # serve the dist/ build locally
```

`npm run build` runs `astro check` first, so a type error or a bad
frontmatter field fails the build loudly instead of shipping something
broken. It also runs [Pagefind](https://pagefind.app/) over the built site
and copies the resulting index into `public/pagefind/` (gitignored,
regenerated on every build) so static search works in production.

## Where content lives

| Section                       | Path                          | Notes |
|--------------------------------|--------------------------------|-------|
| Essays (`/writing`)            | `src/content/essays/*.md`      | AstroPaper's post schema: `title`, `description`, `pubDatetime`, optional `modDatetime`, `tags`, `ogImage`, `featured`. Set `draft: true` to keep a post out of the published list. |
| Newsletter block (`/writing`)  | `src/data/substack.ts`         | A plain hand-edited array — **not** fetched from Substack automatically. Add new posts here by hand. |
| Tools (`/tools`)               | `public/tools/*.html`          | See below. |
| Resources (`/resources`)       | `src/content/resources/*.md`   | One file per link, grouped **category > person** on the page. Managed with `npm run resources` rather than by hand — see below. |
| Books (`/books`)               | `src/content/books/*.md`       | `title`, `author`, `rating` (1–5), `dateRead`, optional `coverImage`. Body is the review text. |
| About (`/about`)               | `src/content/pages/about.md`   | Currently a placeholder. |

Content collections are defined with Zod schemas in `src/content.config.ts`
— a bad or missing frontmatter field fails the build loudly instead of
silently shipping a broken page.

## Adding a resource

`/resources` is a list of outbound links nested category > person. Each link is
one file in `src/content/resources/`, and a single `order` field drives the
whole arrangement: a category and a person each inherit the lowest `order`
beneath them.

Those files are managed by a small zero-dependency CLI rather than edited by
hand, so slugs, `order` numbers and renumbering stay consistent:

```bash
npm run resources -- help     # command reference
npm run resources -- list     # the page's running order, with slugs
npm run resources -- add entries.json
npm run resources -- move "Jon Frederickson" --before "Jonathan Shedler"
npm run resources -- set shedler-substack duration="52 min"
npm run resources -- rm <slug>
npm run resources -- check    # duplicate links, people missing a profile link
```

Every mutating command renumbers the list to 1..N in render order and rewrites
only the files that actually changed. Person names link to their own sites via
`src/data/people.ts`.

## Adding a new tool

Tools are self-contained, single-file HTML pages, auto-discovered at build
time — no manifest to hand-edit.

1. Drop a self-contained `.html` file into [`public/tools/`](public/tools/).
   Give it its own `<title>` and, ideally, a description meta tag:
   ```html
   <title>Your tool name</title>
   <meta name="description" content="One sentence describing what it does.">
   ```
   (If either is missing, `/tools` falls back to a title guessed from the
   filename and an empty description — see `src/lib/tools.ts`.)
2. Commit and push to `main`.

That's it. `src/lib/tools.ts` reads `public/tools/` at build time and
`src/pages/tools/index.astro` renders the list — no separate build step or
GitHub Action required. The files themselves are copied into `dist/tools/`
verbatim by Astro's static asset handling, so a tool's URL is always
`/tools/<filename>.html`.

## Theme

Colors, both for light and dark mode, live in `src/styles/theme.css` as CSS
custom properties (Tailwind 4's `@theme inline` token registration). The
light/dark toggle in the header persists the choice in `localStorage`
(`src/scripts/theme.ts`). Typography defaults come from
`src/styles/typography.css` via `@tailwindcss/typography`.

## Search

Static search is powered by [Pagefind](https://pagefind.app/), which indexes
the built `dist/` output. It only works after a production build — in `npm
run dev`, `/search` shows a warning instead of live results.

## Deploying

Handled by `.github/workflows/deploy.yml` and `public/CNAME` — not covered
by this README.
