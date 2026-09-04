import { getCollection } from "astro:content";

export type Resource = Awaited<
  ReturnType<typeof getCollection<"resources">>
>[number]["data"];

type Entry = { data: Resource };

/**
 * Three levels of nesting: category > section > group. Rather than carry a
 * sort key at each level, everything inherits the lowest `order` of the
 * entries beneath it, so the ordering from the staging folder survives with
 * one number per link.
 */
function groupBy<T extends Entry>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(item);
  }
  return [...groups.entries()]
    .map(([name, entries]) => ({
      name,
      entries: entries.sort((a, b) => a.data.order - b.data.order),
      order: Math.min(...entries.map(e => e.data.order)),
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * The format a section is mostly made of, so entries that match it can skip a
 * label that would only repeat the heading above them.
 */
function dominantFormat<T extends Entry>(entries: T[]) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.data.format, (counts.get(e.data.format) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Slug for the in-page anchor on a category heading. */
export function anchor(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getResourceTree() {
  const resources = await getCollection("resources");

  return groupBy(resources, r => r.data.category).map(category => ({
    ...category,
    id: anchor(category.name),
    sections: groupBy(category.entries, r => r.data.section).map(section => ({
      ...section,
      implied: dominantFormat(section.entries),
      groups: groupBy(section.entries, r => r.data.group ?? "").map(group => ({
        ...group,
        // Profile links say where to find someone rather than pointing at one
        // thing they made, so they belong in the heading, not the list.
        profiles: group.entries.filter(e => e.data.role === "profile"),
        items: group.entries.filter(e => e.data.role !== "profile"),
      })),
    })),
  }));
}
