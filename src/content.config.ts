import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import config from "@/config";

export const BLOG_PATH = "src/content/essays";

const essays = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      author: z.string().default(config.site.author),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      title: z.string(),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default(["others"]),
      ogImage: image().or(z.string()).optional(),
      description: z.string(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonicalURL: z.string().optional(),
  }),
});

/*
  Resources are outbound links, and the page has to preview them well enough
  that someone can decide whether to click. Everything except `note` is
  factual metadata about the destination — show, episode, author, date — so a
  reader gets the preview without anyone having to write ad copy for it.

  `note` is Greg's own words and is optional. Most links don't have one, and
  an empty note is better than an invented one.

  Grouping is three deep: category (topic) > section (Podcasts, Articles) >
  group (usually a person). `order` is the only sort knob — sections and
  groups inherit the lowest order of the entries inside them.
*/
const resources = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/resources" }),
  schema: z.object({
    title: z.string(),
    url: z.url(),
    category: z.string(),
    section: z.string(),
    group: z.string().optional(),
    format: z.enum(["podcast", "article", "newsletter", "group"]),
    source: z.string().optional(),
    byline: z.string().optional(),
    episode: z.string().optional(),
    published: z.coerce.date().optional(),
    duration: z.string().optional(),
    note: z.string().optional(),
    order: z.number().default(0),
    added: z.coerce.date().optional(),
  }),
});

const books = defineCollection({
  loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/content/books" }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    rating: z.number().min(1).max(5),
    dateRead: z.coerce.date(),
    coverImage: z.string().optional(),
  }),
});

export const collections = { essays, pages, resources, books };
