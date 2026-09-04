import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const essaysSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  tags: z
    .array(z.string())
    .refine((items) => new Set(items).size === items.length, {
      message: 'tags must be unique',
    })
    .optional(),
  draft: z.boolean().optional().default(false),
});

const resourcesSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  category: z.string(),
  note: z.string(),
  added: z.coerce.date().optional(),
});

const booksSchema = z.object({
  title: z.string(),
  author: z.string(),
  rating: z.number().min(1).max(5),
  dateRead: z.coerce.date(),
  coverImage: z.string().optional(),
});

export type EssaysSchema = z.infer<typeof essaysSchema>;
export type ResourcesSchema = z.infer<typeof resourcesSchema>;
export type BooksSchema = z.infer<typeof booksSchema>;

const essays = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/essays' }),
  schema: essaysSchema,
});

const resources = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/resources' }),
  schema: resourcesSchema,
});

const books = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/books' }),
  schema: booksSchema,
});

export const collections = { essays, resources, books };
