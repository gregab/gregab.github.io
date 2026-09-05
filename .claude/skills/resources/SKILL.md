---
name: resources
description: Publish, reorder, edit or remove entries on /resources — the linked recommendation list at src/content/resources/. Use when Greg mentions resources, recs, recommendations, links, podcasts, articles or "the resources folder/note", when converting a staged Obsidian note under Website/Resources/ into site content, or when anything on the /resources page needs adding, re-arranging, correcting or deleting.
---

# Publishing to /resources

`/resources` is a list of outbound links, nested **category > person > links**.
The person is the unit worth finding, so everything they made sits in one flat
list under their name, whatever its format.

Two jobs, and only one of them is yours to think about:

| Job | Who does it |
|---|---|
| What is this link? Canonical URL, show, episode, date, length | You. This is the whole cost. |
| Slugs, `order` numbers, file layout, keeping numbering contiguous | `npm run resources` |

Never hand-write a file in `src/content/resources/` and never edit an `order:`
field. The CLI owns both, and it keeps `order` at 1..N in exactly the sequence
the page renders — so the numbers in `list` are also the positions.

```bash
npm run resources -- help     # full command reference
npm run resources -- list     # current running order, with slugs
```

## Adding entries

**1. Read the staging note.** Greg drafts in
`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Master Vault/Website/Resources/`.
Only that subfolder — the rest of the vault is private. A file sitting there is
not consent to publish it; publish what he named, and ask if the scope is
unclear.

Expect loose prose: a bare URL, a half-remembered episode title, "the Shedler
one about quick fixes". Expect Obsidian syntax (`[[wikilinks]]`, `![[embeds]]`,
callouts) and convert it away.

**2. Look each one up.** This is the expensive step, so do it once, in
parallel, and fetch the page rather than guessing from memory. You need enough
that a reader can size up the link without clicking:

- **podcast** — the show (`source`), `episode` if it is numbered, `published`,
  `duration` if the page states it
- **article** — the publication (`source`) and the author (`byline`)
- **newsletter / group** — the platform (`source`): "Substack", "Facebook"

Prefer the show's own episode page over an aggregator; use Apple Podcasts only
when there is no canonical page. `title` is the destination's own title,
copied, not a description of it.

**3. Emit one JSON array and run it.** One command, however many entries:

```bash
npm run resources -- add - <<'JSON'
[
  {
    "title": "What Good Psychotherapy Looks Like With Dr. Jonathan Shedler",
    "url": "https://complextraumatrainingcenter.com/transformingtrauma/episode-143/",
    "category": "Psychotherapy",
    "group": "Jonathan Shedler",
    "format": "podcast",
    "source": "Transforming Trauma",
    "episode": "Episode 143",
    "published": "2024-09-11"
  }
]
JSON
```

New entries land at the end of their person's block, or start a new block at
the end of their category. To place one exactly, give it `"after": "<slug>"` or
`"before": "<slug>"`. `slug`, `order` and `added` are generated; only set
`slug` to match an existing naming pattern deliberately.

**4. If the person is new to the site**, add them to `src/data/people.ts` so
their name links to their own home on the web. `check` warns when one is
missing. If they genuinely have no site, leave them out — the name renders
unlinked, and no destination gets invented to fill the gap.

**5. Verify, then ship.**

```bash
npm run resources -- check    # duplicates, missing people, fields that read wrong
npm run resources -- list     # eyeball the running order
npm run build                 # must pass; Zod fails the build on bad frontmatter
```

Commit and push to `main`. Greg does not want to review the diff first.

## Fields, and where each one surfaces

Required: `title`, `url`, `category`, `format`.
`format` is one of `podcast`, `article`, `newsletter`, `group`, and renders as
the small label above the link.

| Field | On the page |
|---|---|
| `title` | The link text |
| `group` | The person's heading; links out via `src/data/people.ts` |
| `source` `byline` `episode` `published` `duration` | The grey meta line, joined by `·`, plus the domain |
| `note` | Greg's own sentence, below the link |
| `section` | Nothing. Kept so the Podcasts/Articles distinction survives if it ever earns its layout back. |

`published` shows as month and year, so the day is never displayed — store the
real date anyway.

Two de-duplications happen automatically in `ResourceLink.astro`: a `title`
identical to the heading above it falls back to `source` for link text
("Jonathan Shedler" → "Substack"), and a `byline` that repeats the heading is
dropped. Don't work around them by rewording the title.

## The prose is Greg's

`note` is the only editorial voice on the page, it is optional, and most
entries don't have one. **Never write one.** If a link seems to need context he
hasn't given, leave `note` off and tell him — the factual meta line is what
previews a link. When he does supply a note, use his sentence verbatim; fix
outright errors (typos, missing words, wrong proper nouns) and say what you
changed, but leave fragments and rhythm alone.

## Re-arranging, editing, removing

`<what>` below is a slug, a person's name, or a category name. A person or a
category moves as one block. Quote names with spaces.

```bash
# Put a person above another; their whole list travels with them
npm run resources -- move "Jon Frederickson" --before "Jonathan Shedler"

# Reposition one link, or send it to the top of the page
npm run resources -- move shedler-modern-wisdom-567 --after shedler-substack
npm run resources -- move zen-practice-and-the-spiritual-unconscious --first

# Move a link under a different person (--regroup adopts their category/group)
npm run resources -- move some-slug --after frederickson-shrink-rap-radio-866 --regroup

# Rewrite the whole running order. Every entry must appear, so nothing
# silently keeps its old place; the error lists whatever you left out.
npm run resources -- reorder "Jon Frederickson" "Jonathan Shedler" "Lawson Sachter"

# Edit fields in place; an empty value clears one
npm run resources -- set shedler-substack episode= duration="52 min"

# Remove
npm run resources -- rm shedler-modern-wisdom-567
```

Every one of these renumbers the whole list afterwards and rewrites only the
files that actually changed, so a one-line reorder stays a small diff.

## Design decisions already made — don't undo them

- Category headings are hidden while there is only one category, since the name
  would just repeat the page title. Adding a second category makes them appear.
- One flat list per person, mixing formats. Splitting a person across
  "Podcasts" and "Articles" headings buried the person; that was tried and
  reverted.
- `order` is one number per link, and categories and people each inherit the
  lowest number beneath them. There is no separate sort key per level.
- Links take the amber `marked` highlighter, not a colour. No filled buttons.
