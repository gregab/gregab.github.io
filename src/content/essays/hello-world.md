---
title: "Hello, world — this essay is a placeholder"
description: "A placeholder essay so the writing section has something to render. Replace with real writing."
pubDatetime: 2026-08-15T00:00:00.000Z
tags: ["placeholder", "meta"]
---

This is a **placeholder essay**. It exists so the `/writing` page and the `/writing/[slug]` route have something real to render while the site is being built out.

Replace this file (or delete it) once there's an actual first post. A few things worth noting about how this collection works:

- Files live in `src/content/essays/` as Markdown (or MDX).
- Frontmatter needs at least `title`, `description`, and `pubDatetime`.
- Add `tags: [...]`, an `ogImage`, or `modDatetime` as needed.
- Set `draft: true` on a post to keep it out of the published list while still being able to preview it locally.

Everything below this point is just filler text to make the layout feel like a real, multi-paragraph post.

Astro's content collections type-check frontmatter against a Zod schema defined in `src/content.config.ts`, so a missing required field will fail the build loudly instead of silently rendering blank. That's a deliberate trade — better to catch a typo in `pubDatetime` at build time than to publish a post with a broken date.
