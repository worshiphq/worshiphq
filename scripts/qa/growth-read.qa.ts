// Read-only: works out the SuperAdmin Growth numbers from the live database and prints a summary. Writes nothing.
import { getInAppUsage } from "@/lib/data/growth";
import { getGa4Report, getSearchReport } from "@/lib/integrations/google-data";

(async () => {
  const t = Date.now();
  const u = await getInAppUsage();
  console.log(`in-app in ${Date.now() - t}ms`);
  console.log("churches", u.churches, "signups", u.signups, "active", u.active, "funnel", u.funnel);
  console.log("plans", u.plans);
  console.log("heard", u.heardFrom.slice(0, 6));
  console.log("places", u.places.slice(0, 5));
  console.log("features", u.features.slice(0, 8));
  console.log("daily sum", u.daily.reduce((s, d) => s + d.signups, 0), "days", u.daily.length);
  console.log("ga", (await getGa4Report()).ok ? "ok" : await getGa4Report());
  console.log("gsc", (await getSearchReport()).ok ? "ok" : await getSearchReport());
  process.exit(0);
})();
