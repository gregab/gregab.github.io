# gregbigelow.com

Astro 5 site (Tailwind 3 + daisyUI 4, adapted from the Astrofy theme), deployed to
GitHub Pages at https://www.gregbigelow.com via `.github/workflows/deploy.yml`.
Pushing to `main` deploys. A failed build leaves the previous site live.

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

## Working on the site

```bash
npm run dev     # localhost:4321, hot reload — use this for design iteration
npm run build   # must pass before pushing; strict Zod schemas fail the build on bad frontmatter
```

- **Tools** are self-contained HTML in `public/tools/`. `src/lib/tools.ts` discovers
  them at build time by parsing each file's `<title>` and `<meta name="description">`.
  Dropping a file in is the whole workflow — there is no manifest to update.
- **Substack** posts are a hand-maintained list in `src/data/substack.ts`. No RSS fetch.
- **Theme** is daisyUI `nord` (light) / `dim` (dark), set in `tailwind.config.cjs`
  and toggled from the sidebar footer.

## Deployment facts

- Repo `gregab/gregab.github.io`, Pages source is **GitHub Actions** (not branch-based).
- Custom domain lives in `public/CNAME`; DNS is Cloudflare (grey-cloud / DNS-only —
  proxying breaks GitHub's cert issuance).
- Greg does not want to review diffs before they land. Commit and push completed
  work directly; don't ask for approval on ordinary changes.
