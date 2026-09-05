/*
  The Curiosity Timeline on /curiosity, in reading order: the first entry is the
  earliest and sits at the top of the page, the last is the most recent and sits
  at the bottom. Add to the end.

  Greg edits this by hand. Titles and authors are the display forms, not
  Goodreads' full subtitled ones — "The Man Who Mistook His Wife for a Hat"
  rather than "…and Other Clinical Tales" — because the timeline sets them at
  16px and a subtitle swamps the line.

  `cover` is optional. When it is set the timeline uses it as-is. When it is
  empty the page asks Open Library for a cover in the visitor's browser (see
  CuriosityTimeline.astro) and falls back to the drawn placeholder if that finds
  nothing. Pasting real cover URLs in here — the /tools/curiosity-timeline
  generator will hand you a set — removes that lookup entirely, which is the
  better end state.
*/

export interface CuriosityEntry {
  /** Display title. */
  title: string;
  /** Display author. Empty is fine; the meta line just drops it. */
  author?: string;
  /** Goodreads book or series URL. */
  url: string;
  /** Goodreads series pages get labelled as such, since they aren't one book. */
  series?: boolean;
  /** Cover image URL. Empty means "look one up at runtime". */
  cover?: string;
  /** Overrides the Open Library query when title + author don't find it. */
  lookup?: string;
}

export const CURIOSITY_TIMELINE: CuriosityEntry[] = [
  {
    title: "Redwall",
    author: "Brian Jacques",
    url: "https://www.goodreads.com/series/40340-redwall",
    series: true,
  },
  {
    title: "Ender's Game",
    author: "Orson Scott Card",
    url: "https://www.goodreads.com/book/show/375802.Ender_s_Game",
  },
  {
    title: "How to Become a Straight-A Student",
    author: "Cal Newport",
    url: "https://www.goodreads.com/book/show/253203.How_to_Become_a_Straight_A_Student",
  },
  {
    title: "Darwin's Dangerous Idea",
    author: "Daniel C. Dennett",
    url: "https://www.goodreads.com/book/show/2068.Darwin_s_Dangerous_Idea",
  },
  {
    title: "The Selfish Gene",
    author: "Richard Dawkins",
    url: "https://www.goodreads.com/book/show/61535.The_Selfish_Gene",
  },
  {
    title: "Freedom Evolves",
    author: "Daniel C. Dennett",
    url: "https://www.goodreads.com/book/show/2071.Freedom_Evolves",
  },
  {
    title: "The Inner Game of Tennis",
    author: "W. Timothy Gallwey",
    url: "https://www.goodreads.com/book/show/905.The_Inner_Game_of_Tennis",
  },
  {
    title: "The Singularity Is Near",
    author: "Ray Kurzweil",
    url: "https://www.goodreads.com/book/show/83518.The_Singularity_is_Near",
  },
  {
    title: "What the Buddha Taught",
    author: "Walpola Rahula",
    url: "https://www.goodreads.com/book/show/390562.What_the_Buddha_Taught",
  },
  {
    title: "Mindfulness in Plain English",
    author: "Bhante Henepola Gunaratana",
    url: "https://www.goodreads.com/book/show/64369.Mindfulness_in_Plain_English",
  },
  {
    title: "The Man Who Mistook His Wife for a Hat",
    author: "Oliver Sacks",
    url: "https://www.goodreads.com/book/show/63697.The_Man_Who_Mistook_His_Wife_for_a_Hat_and_Other_Clinical_Tales",
  },
  {
    title: "The Journals of Henry David Thoreau",
    author: "Henry David Thoreau",
    url: "https://www.goodreads.com/book/show/5984293-the-journal-1837-1861",
  },
  {
    title: "True Hallucinations",
    author: "Terence McKenna",
    url: "https://www.goodreads.com/book/show/61118029-true-hallucinations",
  },
  {
    title: "Phantoms in the Brain",
    author: "V. S. Ramachandran and Sandra Blakeslee",
    url: "https://www.goodreads.com/book/show/31555.Phantoms_in_the_Brain",
  },
  {
    title: "Ethics",
    author: "Baruch Spinoza",
    url: "https://www.goodreads.com/book/show/205218.Ethics",
  },
  {
    title: "Spinoza's Ethics: An Introduction",
    author: "Steven Nadler",
    url: "https://www.goodreads.com/book/show/37517.Spinoza_s_ethics_",
  },
  {
    title: "Starting Strength",
    author: "Mark Rippetoe",
    url: "https://www.goodreads.com/book/show/2098799.Starting_Strength",
  },
  {
    title: "A Thousand Plateaus",
    author: "Gilles Deleuze and Félix Guattari",
    url: "https://www.goodreads.com/book/show/118316.A_Thousand_Plateaus",
  },
  {
    title: "The Invisibles",
    author: "Grant Morrison",
    url: "https://www.goodreads.com/series/59889-the-invisibles",
    series: true,
  },
  {
    title: "Gödel, Escher, Bach",
    author: "Douglas R. Hofstadter",
    url: "https://www.goodreads.com/book/show/24113.G_del_Escher_Bach",
  },
  {
    title: "Saga of the Swamp Thing, Book One",
    author: "Alan Moore",
    url: "https://www.goodreads.com/book/show/44195369-saga-of-the-swamp-thing-book-1",
  },
  {
    title: "Anathem",
    author: "Neal Stephenson",
    url: "https://www.goodreads.com/book/show/2845024-anathem",
  },
  {
    title: "The Pragmatic Programmer",
    author: "Andrew Hunt and David Thomas",
    url: "https://www.goodreads.com/book/show/4099.The_Pragmatic_Programmer",
  },
  {
    title: "Functional JavaScript",
    author: "Michael Fogus",
    url: "https://www.goodreads.com/book/show/17623632-functional-javascript",
  },
  {
    title: "Jonathan Strange & Mr Norrell",
    author: "Susanna Clarke",
    url: "https://www.goodreads.com/book/show/14201.Jonathan_Strange_Mr_Norrell",
  },
  {
    title: "The Little Schemer",
    author: "Daniel P. Friedman and Matthias Felleisen",
    url: "https://www.goodreads.com/book/show/548914.The_Little_Schemer",
  },
  {
    title: "A Wizard of Earthsea",
    author: "Ursula K. Le Guin",
    url: "https://www.goodreads.com/book/show/13642.A_Wizard_of_Earthsea",
  },
  {
    title: "Reasons and Persons",
    author: "Derek Parfit",
    url: "https://www.goodreads.com/book/show/327051.Reasons_and_Persons",
  },
  {
    title: "The Mind Illuminated",
    author: "Culadasa (John Yates)",
    url: "https://www.goodreads.com/book/show/25942786-the-mind-illuminated",
  },
  {
    title: "Washington Scrambles",
    author: "Peggy Goldman",
    url: "https://www.goodreads.com/book/show/18569254-washington-scrambles",
  },
  {
    title: "Mastering the Core Teachings of the Buddha",
    author: "Daniel M. Ingram",
    url: "https://www.goodreads.com/book/show/4129848-mastering-the-core-teachings-of-the-buddha",
  },
  {
    title: "Seeing That Frees",
    author: "Rob Burbea",
    url: "https://www.goodreads.com/book/show/25172403-seeing-that-frees",
  },
  {
    title: "Permutation City",
    author: "Greg Egan",
    url: "https://www.goodreads.com/book/show/156784.Permutation_City",
  },
  {
    title: "Emptiness Dancing",
    author: "Adyashanti",
    url: "https://www.goodreads.com/book/show/190055.Emptiness_Dancing",
  },
  {
    title: "A Fire Upon the Deep",
    author: "Vernor Vinge",
    url: "https://www.goodreads.com/book/show/77711.A_Fire_Upon_the_Deep",
  },
  {
    title: "A Path with Heart",
    author: "Jack Kornfield",
    url: "https://www.goodreads.com/book/show/143675.A_Path_with_Heart",
  },
  {
    title: "Awake",
    author: "Angelo DiLullo",
    url: "https://www.goodreads.com/book/show/58045165-awake",
  },
  {
    title: "The Book of the New Sun",
    author: "Gene Wolfe",
    url: "https://www.goodreads.com/series/41474-the-book-of-the-new-sun",
    series: true,
  },
  {
    title: "Opening the Heart of Compassion",
    author: "Martin Lowenthal and Lar Short",
    url: "https://www.goodreads.com/book/show/2363424.Opening_the_Heart_of_Compassion",
  },
  {
    title: "The Precious Treasury of the Basic Space of Phenomena",
    author: "Longchen Rabjam",
    url: "https://www.goodreads.com/book/show/2741803-the-precious-treasury-of-the-basic-space-of-phenomena-seven-treasuries",
  },
  {
    title: "The Journey of Soul Initiation",
    author: "Bill Plotkin",
    url: "https://www.goodreads.com/book/show/55162140-the-journey-of-soul-initiation",
  },
  {
    title: "The Book of the Long Sun",
    author: "Gene Wolfe",
    url: "https://www.goodreads.com/series/43253-the-book-of-the-long-sun",
    series: true,
  },
  {
    title: "The Book of the Short Sun",
    author: "Gene Wolfe",
    url: "https://www.goodreads.com/series/40848-the-book-of-the-short-sun",
    series: true,
  },
];
