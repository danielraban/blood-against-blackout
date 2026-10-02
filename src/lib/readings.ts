import type { Fellowship } from "./fellowship";

export const READING_FELLOWSHIPS = ["aa", "na", "ca"] as const satisfies readonly Fellowship[];

export const READING_HEADING: Record<(typeof READING_FELLOWSHIPS)[number], string> = {
  aa: "a.a.",
  na: "n.a.",
  ca: "c.a.",
};

export const READINGS: ReadonlyArray<{
  fellowship: (typeof READING_FELLOWSHIPS)[number];
  title: string;
  href: string;
}> = [
  { fellowship: "aa", title: "A.A. Preamble", href: "https://www.aa.org/aa-preamble" },
  {
    fellowship: "aa",
    title: "How It Works",
    href: "https://www.aa.org/sites/default/files/literature/assets/p-10_howitworks.pdf",
  },
  { fellowship: "aa", title: "Twelve Steps", href: "https://www.aa.org/the-twelve-steps" },
  { fellowship: "aa", title: "Twelve Traditions", href: "https://www.aa.org/the-twelve-traditions" },
  { fellowship: "aa", title: "The Promises", href: "https://www.aa.org/faq/what-are-promises" },
  { fellowship: "aa", title: "I Am Responsible", href: "https://www.aa.org/a-declaration-of-unity" },
  { fellowship: "aa", title: "more A.A. literature", href: "https://www.aa.org/resources/literature" },
  {
    fellowship: "na",
    title: "Who, What, How, and Why",
    href: "https://na.org/e-lit/ip-1-who-what-how-and-why/",
  },
  {
    fellowship: "na",
    title: "Just for Today",
    href: "https://na.org/e-lit/just-for-today-group-reading/",
  },
  {
    fellowship: "na",
    title: "The Group Booklet",
    href: "https://na.org/e-lit/the-group-booklet/",
  },
  {
    fellowship: "na",
    title: "more N.A. literature",
    href: "https://na.org/literature/recovery-literature-in-english-usa/",
  },
  { fellowship: "ca", title: "What is C.A.?", href: "https://ca.org/literature/what-is-ca/" },
  {
    fellowship: "ca",
    title: "Twelve Steps and Twelve Traditions",
    href: "https://ca.org/12and12/",
  },
  { fellowship: "ca", title: "more C.A. literature", href: "https://ca.org/literature/" },
];
