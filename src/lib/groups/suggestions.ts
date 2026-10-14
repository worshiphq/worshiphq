/** Ideas for groups most churches need. Client-safe. */
export type SuggestionSet = { id: string; title: string; type: string; why: string; names: string[] };

export const SUGGESTION_SETS: SuggestionSet[] = [
  { id: "ministries", title: "Ministries and teams", type: "Ministry", why: "The teams that serve on a Sunday.", names: ["Choir", "Ushers", "Protocol", "Media Team", "Prayer Warriors", "Evangelism Team", "Children's Church Teachers", "Hospitality"] },
  { id: "fellowships", title: "Fellowships", type: "Fellowship", why: "People who meet by season of life.", names: ["Men's Fellowship", "Women's Fellowship", "Youth Fellowship", "Singles", "Couples and Marriage", "Widows and Widowers"] },
  { id: "communities", title: "Student communities", type: "Community", why: "Keep students together, and message them as one.", names: ["Basic School Students", "SHS Students Community", "Tertiary Students Community", "Young Professionals"] },
  { id: "cells", title: "Home cells", type: "Small group", why: "Small groups that meet in homes during the week.", names: ["Home Cell 1", "Home Cell 2", "Home Cell 3"] },
  { id: "committees", title: "Committees", type: "Committee", why: "The people who plan and oversee.", names: ["Finance Committee", "Welfare Committee", "Building Committee", "Planning Committee"] },
];

export type SuggestionContext = { hasTeens: boolean; hasChildren: boolean };

/** What to suggest now: the sets above minus anything the church already has, with a few touches from what the church looks like. */
export function suggestionsFor(existing: string[], ctx: SuggestionContext): SuggestionSet[] {
  const have = new Set(existing.map((n) => n.trim().toLowerCase()));
  const sets = SUGGESTION_SETS.map((s) => ({ ...s, names: [...s.names] }));
  if (ctx.hasTeens) sets.find((s) => s.id === "fellowships")?.names.unshift("Teens Fellowship");
  if (ctx.hasChildren) sets.find((s) => s.id === "ministries")?.names.push("Sunday School");
  return sets
    .map((s) => ({ ...s, names: s.names.filter((n) => !have.has(n.toLowerCase())) }))
    .filter((s) => s.names.length > 0);
}
