/**
 * Private teaching and demo churches the owner uses to show WorshipHQ to people (sign-in only, not the public
 * "View live demo"). Their members use sample phone numbers (010…) that are never texted, and sample emails at
 * example.com that are never sent. SuperAdmin labels them DEMO.
 */
export const TEACHING_CHURCH_IDS: readonly string[] = [
  "cmwmc3jyw0000gu095ebupj8b", // Worship Center (saxdemo login)
];

export const isTeachingChurch = (id: string | null | undefined) => !!id && TEACHING_CHURCH_IDS.includes(id);
