# gregab.github.io

Personal Pages — small, single-page HTML tools, listed automatically at [gregab.github.io](https://gregab.github.io).

## Adding a new tool

1. Drop a self-contained `.html` file into [`tools/`](tools/). It should have its own `<title>` and, ideally, a description meta tag:
   ```html
   <title>Your tool name</title>
   <meta name="description" content="One sentence describing what it does.">
   ```
   (If either is missing, the index falls back to a title guessed from the filename and an empty description.)
2. Commit and push to `main`.

That's it — a GitHub Action ([`.github/workflows/build-tools-index.yml`](.github/workflows/build-tools-index.yml)) rebuilds [`tools.json`](tools.json) from everything in `tools/` and commits it back, and [`index.html`](index.html) reads that file to render the list at gregab.github.io. No manual edits to the index page are needed.

To preview the manifest locally instead of waiting on CI:

```bash
node scripts/build-index.js
```
