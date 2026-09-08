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
| `Resources/*.md`      | `src/content/resources/` — use the `resources` skill |
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
- **The prose on the site is Greg's.** Don't write blurbs, link descriptions,
  page subtitles or any other voice copy for him. Formatting, structure and
  presentation are yours to design; the words are not. When a design needs
  descriptive text he hasn't written, use factual metadata about the thing
  instead — for an outbound link that's the show or publication, author,
  episode, date, length, domain, which previews it without editorialising. If
  a slot really needs prose and he hasn't supplied it, leave it empty and tell
  him.
- **Proofread before publishing.** Greg drafts fast and expects the publish step
  to catch what he missed. Fix outright errors (typos, missing words, broken
  grammar, wrong proper nouns) as part of the same change and say what you
  changed. Flag judgment calls about voice or fact rather than silently
  "improving" them — his sentence fragments and rhythm are style, not mistakes.

## What is public right now

The site is deliberately minimal: the homepage bio, `/curiosity` (the reading
list as a walkable 3D corridor) and `/resources`.
Most of the rest is **parked, not deleted** — Greg wants to publish those sections
when he has real content, so the code and schemas all still exist.

Parking uses Astro's own convention: a leading `_` excludes a file or directory
from routing, and the collection globs (`**/[^_]*.{md,mdx}`) exclude `_`-prefixed
content. To bring a section back, drop the underscore and re-add its nav item in
`src/components/Header.astro`.

| Parked | Path |
|--------|------|
| Essays / writing | `src/pages/_writing/` |
| Books | `src/pages/_books/` |
| About | `src/pages/_about.astro`, `src/content/pages/_about.md` |
| Tags, archives, search | `src/pages/_tags/`, `_archives/`, `_search.astro` |
| RSS feed | `src/pages/_rss.xml.ts` |
| Placeholder content | `_`-prefixed files under `src/content/*/` |

The **tools section is gone, not parked**: `/tools`, the standalone HTML in
`public/tools/` and the `src/lib/tools.ts` discovery module were all deleted,
along with the nav item and the "create your own" link on `/curiosity`. Git
history has them if it comes back.

`features.showArchives` and `features.search` are `false` in
`astro-paper.config.ts` to match. Layout's RSS autodiscovery tag was removed
while the feed is parked — restore it when `_rss.xml.ts` comes back, since
advertising a feed that 404s is worse than advertising none.

**The published contact address is `hello@gregbigelow.com`**, a Cloudflare Email
Routing alias that forwards to Greg's inbox. Never replace it with a personal
address — keeping the personal one off a public page is the whole point.

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
- **Resources** are never hand-edited. `npm run resources -- <cmd>` (see
  `scripts/resources.mjs`) owns slugs, `order` numbers and file layout; it keeps
  `order` at 1..N in render order so re-arranging is one command instead of
  renumbering every file. The **`resources` skill**
  (`.claude/skills/resources/SKILL.md`) has the whole pipeline from a staged
  Obsidian note to a deployed page — read it before touching `/resources`.
- **The curiosity timeline is a 3D corridor.** `/curiosity` renders
  `src/components/CuriosityCorridor.astro`, a first-person gallery built with
  three.js in `src/scripts/corridor/` (`corridor.ts` scene, `input.ts` keys /
  drag / touch stick, `textures.ts` procedural surfaces, plaques and the
  painted ceiling, `frames.ts` the five mouldings, `props.ts` plants,
  benches and the runner, `ends.ts` the two open ends, `windows.ts` the
  wall arcade, `bearers.ts` the creatures holding the frames, `walkway.ts`
  the parked moving walkway, `palette.ts` theme tokens). The data is still `src/data/curiosity.ts`, in
  the same order: entry 0 hangs first, on the left, and they alternate walls.
  The old 2D `CuriosityTimeline.astro` is not parked — it is the fallback,
  swapped in from a `<template>` when WebGL is missing (iOS Lockdown Mode,
  some corporate browsers) and served inside `<noscript>`. Keep both working.
  three.js loads as its own chunk after page-load (~150 KB gzipped); don't
  import it anywhere else. Headless Chromium + Playwright with
  `--use-angle=swiftshader` renders it fine for screenshots (at ~2 fps, so
  set position through the `corridor.state` handle on the root element
  rather than holding keys).
- **Curiosity timeline covers** come from Open Library. `npm run covers` resolves
  them once, offline, and writes `cover:` URLs into `src/data/curiosity.ts`;
  `-- --check` reports what's missing and `-- --force` re-resolves everything.
  Run it after adding entries and commit the result — a baked URL is a static
  image, while an unbaked one costs every visitor a round of API calls.
  Anything it can't find takes a `lookup` (retry under a different title) or a
  hand-pasted `cover`.
  The query ladder lives in `src/lib/openlibrary.mjs`, shared by that script and
  the page's runtime fallback. Note **the display byline is not a search term**:
  Open Library matches authors individually, so "Gilles Deleuze and Félix
  Guattari" matches nothing and gets narrowed to the first name before it is
  sent. That bug cost six entries their covers.
  The corridor and the 2D timeline share one browser cache
  (`src/lib/coverCache.ts`) and one resolver for the list
  (`src/scripts/timelineCovers.ts`); the corridor requests the `-L` size and
  loads nearest-first, only within reach, so bandwidth scales with how far a
  visitor walks. Cover images are drawn into a WebGL texture, which needs
  CORS; if Open Library ever stops sending it, the cloth-bound placeholder
  (title stamped in gilt, in the entry's arc colour) is what shows.
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
- **The mark is rationed.** `marked` (visible at rest) is for links inside
  prose, where it's the only thing telling you a phrase mid-sentence is
  clickable, and for the current nav item. Every link in a *list* uses
  `mark-hover` instead — bare ink at rest, mark on hover. In a list of links
  "this is a link" is already obvious, so a resting mark on each one is
  decoration, and a page of them reads as stripes. All three paint against the
  content box, not the padded box; anchoring to the padded box put the swipe
  below the word on anything with vertical padding.
- **The measure is the point.** 40rem column, 18px body, 1.65 leading — about
  68 characters a line. Newsreader has a small x-height and reads a size
  smaller than it measures, so 16px in the old 48rem column ran to 91
  characters. Don't widen `max-w-app` or shrink the body without recounting.
- **The type scale is 30 / 22 / 20 / 18 / 14px** (page title, person or section
  heading, list title, body, meta). Note 18px body is exactly Tailwind's
  `text-lg`, so `text-lg` no longer reads as "large" — list titles need
  `text-xl` or above to keep their step.
- **Page subtitles are chrome, not prose** — Plex Sans, muted, roman. Italic
  serif at body size read as a pull-quote.
- **The homepage has no heading.** The site name in the header is its `<h1>`;
  the page opens on a short amber stroke (`mark-rule`, the highlighter reduced
  to a single mark) and a lead paragraph. The 48px "Welcome" that used to sit
  there spent the largest type on the page on the least informative line.
- **No filled buttons anywhere.** Bordered or text-only.
- **The curiosity timeline's spine is the one place colour runs free**, and it
  is not a violation of the rule above — it is chrome, never a link treatment.
  `--ct-tint-1..5` in `theme.css` are five stops (gold → terracotta → rose →
  violet → slate) that the spine crossfades through over the length of the page,
  and each entry samples the same gradient with `color-mix` so its node,
  connector and cover strip match the line beside it. It ends on `--accent`, so
  the arc lands on a colour the palette already owns. Titles there still take
  the amber `mark-hover` like every other list link.
- **The corridor spends no new colour either.** Walls are `--muted`, the
  middle distance fogs into a shade below it, the light over each frame
  samples the same
  five-stop arc (`--ct-tint-1..5`, mixed in oklab to match the CSS), and both
  themes are read live from the tokens — toggling re-paints the scene. Gilt,
  walnut and brass are materials, not palette. Text in the scene is metadata
  only: title and author on the plaque and in the caption pill; the help line
  under the canvas is chrome. Frames are all one size on purpose — a gallery
  hang, not a size-means-importance chart — but not one design: five
  mouldings in `src/scripts/corridor/frames.ts` (ornate gilt, walnut
  cassetta, reeded antique gold, ebonised with a gilt slip, arched
  tabernacle) cycle so no two neighbours match, and the gilt varies a shade
  per frame. Each book's label hangs *beside* its frame, on the wall to your
  right as you face it, the way a museum hangs one — big enough to read at
  1.45 m, which is a height you read standing up rather than stooping. The
  ceiling carries the arc overhead, but as ornament rather than as a wash:
  one painted coffer per bay, the same scheme the length of the hall, with
  all five stops inside every coffer (`ceilingCanvas` in `textures.ts`).
  The assignment is deliberate and worth keeping — the star's eight points
  alternate the two ends of the arc, gold against slate, because warm
  against cool is what makes a geometric star legible from 3.5 m below; its
  body takes violet and its boss terracotta so no two touching fields share
  a hue; rose goes to the smaller medallions over the rib crossings so they
  read as their own rhythm. Ground and ribs stay plaster — architecture,
  not colour — and gilt is rationed to the hairlines and the four lozenges.
  Light theme is cream ground with ink outlines; dark theme flips it to a
  deep ground with a gilt hairline, because a dark painted ceiling reads by
  its lines catching the light. It was a per-bay crossfade before, and read
  as beige at the gold end, which is the end everyone sees first. Plants, benches and the runner
  (`props.ts`) are furniture in the same sense gilt and brass are
  materials. **How the books are shown is one switch**, `DISPLAY` at the top
  of `corridor.ts`: `"wall"` hangs them flat on the walls, `"float"`
  suspends them in mid air down both sides of a central aisle. Wall is on
  for now — float stays fully built below and switching back is a one-word
  change, same as the walkway. Walking a hall is a bad way to look at things
  hung flat along it — you see
  every picture edge-on until you are level with it, and by then you have
  passed it — so floating turns each book about 30° out of the wall to face
  whoever is walking at it, paints it on both faces (a box's +z and -z faces
  each carry the map the right way round, so one texture reads correctly
  from in front and behind), moulds the frame on both sides, hangs the label
  underneath instead of beside, and narrows the walkable band to the aisle
  between the two rows. Floating also puts **windows** down both walls
  (`windows.ts`), since the books leaving the walls leaves ninety metres of
  blank plaster: each takes the arc stop nearest its position, so the light
  outside shifts gold to slate as you walk — the arc told as time of day,
  the same claim the open ends make. Note a sky cannot be one hue times a
  value ramp; it is cool overhead and warm at the horizon, and a greyscale
  gradient tinted by a single colour gives a bronze mirror, which is what
  the first version of these looked like. So the glass is drawn in colour,
  five times, one per stop, and the windows are grouped by the stop they
  take. They are flush rather than cut through: there is nothing behind
  those walls but the same backdrop. Windows, plants and benches share the
  free wall positions on a four-step cycle, so nothing lands on anything.
  Floating also has **bearers** (`BEARERS` in `corridor.ts`, `bearers.ts`):
  a tall thin blue creature stands behind every frame holding it out in
  front of itself, with the label dangling from the frame's bottom rail on
  two cords. Its proportions are not a style choice — the body is a narrow
  column because anything wider would block the back of the picture it is
  holding, and the height falls out of the head having to clear the top of a
  frame hung at 1.8 m, which lands it near 2.8 m tall. Its lamp had to move
  forward over the aisle and come down to about half strength, because a
  head a metre under a picture light comes back white however blue it is
  painted; the picture can afford that, since floating it is mostly lit by
  its own emissive map anyway.

  **Careful with the tint tokens in the scene.** `--ct-tint-*` are UI
  values, picked to read against the background they sit on, so the dark
  theme's stops are *lighter* than the light theme's — `--ct-tint-5` is
  `#35566e` by day and `#9db8cc` at night. That is right for a line on a
  dark page and backwards for an object standing under a lamp, which needs
  pigment rather than contrast. The bearers darken their stop in the dark
  theme and lighten it in the light one. Anything else in the scene taking a
  stop as a surface colour needs the same inversion. A floating picture has only a ceiling spot raking
  both its faces, so it carries more of its own light — the emissive map
  goes from a legibility floor to something nearer a lightbox, which is what
  a dim gallery would use anyway. Everything downstream reads `FLOATING`;
  flip the one word and the hall goes back on the walls.
  **Both ends open onto sky** (`ends.ts`) rather than closing on
  a wall — an arched opening with a stone surround and a balustrade, and
  beyond it a sky whose horizon takes the arc stop nearest that end: dawn
  gold where the reading starts, evening slate where it has got to. That is
  the corridor making the same claim the 2D spine makes by fading out at
  both ends instead of stopping. The sky planes are unlit and drawn as
  bands, not detail — from just inside an opening the plane is magnified
  enormously and a gradient survives that where a picture would not.
  The lights are deliberately weak — the lantern on the camera
  especially, since it hits every picture head-on — because the failure mode
  here is a blown-out cover, not a dim hall; the additive glow decals do the
  work of looking lit. The moving walkway down the middle (`walkway.ts`) is
  **parked**, not deleted: `SHOW_WALKWAY` in `corridor.ts` builds it, steps
  it and idles the render loop for its tread. With it off nothing animates
  at rest, so the scene renders only on input. Controls follow
  convention and should stay conventional: W A S D / arrows on a keyboard
  (arrows turn, A/D strafe), mouse look via Pointer Lock — click the canvas
  to capture the cursor, move to turn, click again to open whatever's under
  the crosshair, Escape releases it (native browser behavior, not app code)
  — a floating stick in the lower-left on touch with drag-to-look elsewhere
  (touch never locks the pointer; that's a hidden-cursor idea with no touch
  equivalent), and the old drag-to-look as the fallback where Pointer Lock
  isn't supported at all. `input.ts` owns all of this; `LOCK_SUPPORTED`
  there is the one flag gating it. The caption pill sits at
  the top, clear of the plaque under every frame; on touch it becomes a
  full-width band and the fullscreen button moves to the bottom-right.
- **That spine is a double-headed arrow that fades out at both ends**, and the
  arrowheads deliberately sit *inside* the fade rather than at the tips: the
  line runs past them and dissolves. The list has no first cause and no last
  entry, and the graphic should say so. The runway this needs is `--ct-run`;
  don't reclaim it as stray padding.
- **The timeline alternates left/right at every width, phones included.** The
  zigzag is what makes it read as a timeline rather than a list, so narrow
  screens shrink the card and stack the cover above the title instead of
  collapsing to a single left rail.
- **Fonts:** Newsreader for headings and body (one family, so the page has one
  voice), IBM Plex Sans for chrome only, IBM Plex Mono for code.
  They come from the `@fontsource/*` devDependencies via Astro's **local** font
  provider, so `npm run build` never touches the network for a typeface — see
  the comment block in `astro.config.ts` for why `fontProviders.npm()` doesn't
  work for this and what the tradeoff is. Every variant must keep a **woff**
  alongside its woff2: satori renders the OG images and cannot parse woff2
  (`src/utils/getFontPathByWeight.ts` skips it). Changing a weight or style
  means the variant list in `astro.config.ts`, not a Google Fonts URL.
- **Search** is static, via Pagefind (`astro-paper.config.ts` → `features.search`).
  It only works after a production build — `public/pagefind/` is generated by
  `npm run build` and is gitignored.
- Site-wide config (title, author, socials, feature flags) lives in
  `astro-paper.config.ts`, not scattered across components.

## Which model to use

Be intelligent about it rather than reaching for the biggest model by reflex.
Sonnet handles most of the work here: converting a staged file into content,
adding or editing an entry, copy fixes, dependency bumps, chasing a build
error.

Save Opus for the work that actually benefits from it — high-level planning
and design, visual and information-architecture decisions, restructuring a
page or a schema, anything touching the design language, and untangling a
problem whose shape isn't clear yet.

If a task starts out routine and turns out to need real design judgment, say
so and switch rather than muddling through.

## Deployment facts

- Repo `gregab/gregab.github.io`, Pages source is **GitHub Actions** (not branch-based).
- Custom domain lives in `public/CNAME`; DNS is Cloudflare (grey-cloud / DNS-only —
  proxying breaks GitHub's cert issuance).
- Greg does not want to review diffs before they land. Commit and push completed
  work directly; don't ask for approval on ordinary changes.
- **Finish the job by deploying.** Ordinary work is not done sitting on a
  branch — merge it to `main` and push, which is what deploys. Do that by
  default, without being asked, once the work is complete and `npm run build`
  passes (or the only failure is environmental, like a sandbox blocking the
  font fetch — say so if you couldn't build).
  Stop and ask first only when merging is genuinely not safe: the build is
  broken, the change touches something Greg is mid-conversation about, or it
  publishes content he hasn't named (see the staging-folder rules above).
