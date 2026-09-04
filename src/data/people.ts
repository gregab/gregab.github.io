/*
  Where to find each person whose work is listed on /resources, so their name
  can be the link to their own place on the web rather than dead text above a
  list. Keyed by the exact `group` value used in the resource frontmatter.

  A name with no entry here simply renders unlinked — nothing breaks, and no
  destination gets invented to fill the gap.
*/
export const PEOPLE: Record<string, string> = {
  // The ISTDP Institute is Frederickson's own project and his actual home on
  // the web; jonfrederickson.com is a parked domain with nothing on it.
  "Jon Frederickson": "https://istdpinstitute.com",
  "Jonathan Shedler": "https://jonathanshedler.com",
  "Lawson Sachter": "https://psychodynamiczen.org",
};
