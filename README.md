# gregbigelow.com

Greg Bigelow's personal website: writing, tools, resources, and book notes.
Built with [Astro](https://astro.build) (a sidebar-drawer layout adapted from
the [Astrofy](https://github.com/manuelernestog/astrofy) theme), Tailwind
CSS, and daisyUI. Deployed to GitHub Pages at
[www.gregbigelow.com](https://www.gregbigelow.com).

## Running locally

```bash
npm install
npm run dev      # http://localhost:4321, hot-reloading
npm run build    # outputs the static site to dist/
npm run preview  # serve the dist/ build locally
```

## Where content lives

| Section                | Path                        | Notes |
|-------------------------|------------------------------|-------|
| Essays (`/writing`)     | `src/content/essays/*.md`    | Markdown with `title`, `description`, `pubDate`, optional `tags`, `heroImage`, `updatedDate`. Set `draft: true` to keep a post out of the published list. |
| Newsletter block (`/writing`) | `src/data/substack.ts` | A plain hand-edited array — **not** fetched from Substack automatically. Add new posts here by hand. |
| Tools (`/tools`)        | `public/tools/*.html`        | See below. |
| Resources (`/resources`)| `src/content/resources/*.md` | `title`, `url`, `category`, `note` (one line), optional `added`. Grouped by `category` on the page. |
| Books (`/books`)        | `src/content/books/*.md`     | `title`, `author`, `rating` (1–5), `dateRead`, optional `coverImage`. Body is the review text. |

Content collections are defined with Zod schemas in `src/content.config.ts`
— a bad or missing frontmatter field fails the build loudly instead of
silently shipping a broken page.

## Adding a new tool

This is carried over from the old site: tools are self-contained, single-file
HTML pages, auto-discovered at build time — no manifest to hand-edit.

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

Sidebar footer has a light/dark toggle (daisyUI themes `nord` / `dim`,
persisted in `localStorage`). `tailwind.config.cjs` restricts
`daisyui.themes` to just those two rather than shipping all of daisyUI's
built-in themes.

## Deploying

Handled by `.github/workflows/deploy.yml` and `public/CNAME` — not covered
by this README.
