/* Lets server-side modules load under plain tsx: stubs server-only, next/cache, next/headers and next/navigation. */
const Module = require("module");
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/cache") return { revalidatePath() {}, revalidateTag() {}, unstable_cache: (fn) => fn };
  if (request === "next/headers") return { cookies: async () => ({ get: () => undefined, set() {}, delete() {} }), headers: async () => new Map() };
  if (request === "next/navigation") return { redirect: (u) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error("notFound"); } };
  const mod = orig.apply(this, arguments);
  if (request === "react" && mod && !mod.cache) mod.cache = (fn) => fn;
  return mod;
};
