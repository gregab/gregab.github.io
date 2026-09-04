import { getCollection } from "astro:content";
import { PEOPLE } from "@/data/people";

export type Resource = Awaited<
  ReturnType<typeof getCollection<"resources">>
>[number]["data"];

type Entry = { data: Resource };

/**
 * Two levels of nesting: category > person. Rather than carry a sort key at
 * each level, a category inherits the lowest `order` of the entries beneath
 * it, so the ordering from the staging folder survives with one number per
 * link.
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
      order: Math.min(...entries.map((e) => e.data.order)),
    }))
    .sort((a, b) => a.order - b.order);
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

  return groupBy(resources, (r) => r.data.category).map((category) => ({
    ...category,
    id: anchor(category.name),
    groups: groupBy(category.entries, (r) => r.data.group ?? "").map(
      (group) => ({
        ...group,
        url: group.name ? PEOPLE[group.name] : undefined,
      }),
    ),
  }));
}
