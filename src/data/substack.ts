// Greg edits this list by hand — there is no RSS fetch or build-time sync
// with Substack. When a new newsletter post goes out, add an entry here
// (newest first) and update SUBSTACK_URL if the publication URL changes.

export interface SubstackPost {
  title: string;
  date: string;
  url: string;
}

export const SUBSTACK_URL = "https://gregbigelow.substack.com";

export const SUBSTACK_POSTS: SubstackPost[] = [
  {
    title: "Placeholder newsletter post — replace me",
    date: "2026-08-25",
    url: "https://gregbigelow.substack.com/p/placeholder-post-one",
  },
  {
    title: "Another placeholder issue, backdated a bit",
    date: "2026-07-14",
    url: "https://gregbigelow.substack.com/p/placeholder-post-two",
  },
  {
    title: "A third placeholder, just to show the list with three items",
    date: "2026-06-01",
    url: "https://gregbigelow.substack.com/p/placeholder-post-three",
  },
];
