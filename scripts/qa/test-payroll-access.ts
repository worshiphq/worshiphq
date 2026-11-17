/**
 * Staff & Payroll: who can see payroll. Pure: no database.
 *   npx tsx scripts/qa/test-payroll-access.ts
 */
import { resolveAccess } from "../../src/lib/access-resolve";
import { granted, hasSection, canManage, PRIVATE_SECTIONS, ALL_MODULES } from "../../src/lib/permissions";
import { featureForSection, planHasFeature, DEFAULT_PLAN_TABLE, FEATURES_ADDED_LATER, ALL_FEATURES, getRouteFeature, type PlanId } from "../../src/lib/plan-gate";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
const sees = (a: ReturnType<typeof resolveAccess>, k: string) => hasSection({ sections: a.sections, exactSections: a.exactSections }, k);
const manages = (a: ReturnType<typeof resolveAccess>, k: string) => canManage({ manageSections: a.manageSections, exactSections: a.exactSections }, k);

// Admin built-in role: Staff (through Settings) but never Payroll.
const admin = resolveAccess({ role: "Admin" });
eq("Admin sees staff", sees(admin, "staff"), true);
eq("Admin manages staff", manages(admin, "staff"), true);
eq("Admin has no payroll", [sees(admin, "payroll"), admin.payroll], [false, null]);
eq("Pastor sees staff", sees(resolveAccess({ role: "Pastor" }), "staff"), true);

// Finance cannot see payroll or staff.
const fin = resolveAccess({ role: "Finance" });
eq("Finance no payroll", sees(fin, "payroll"), false);
eq("Finance no staff", sees(fin, "staff"), false);

// A custom role posted with payroll is stripped.
const custom = resolveAccess({ role: "Volunteer", customRole: { sections: ["people", "payroll", "my-pay"], manageSections: ["payroll"], manageSplit: true, canDelete: false } });
eq("custom role payroll stripped", [sees(custom, "payroll"), sees(custom, "my-pay"), manages(custom, "payroll")], [false, false, false]);
// A church override listing payroll is stripped too.
const over = resolveAccess({ role: "Leader", churchOverrides: { Leader: { view: ["people", "payroll"], manage: ["payroll"] } } });
eq("church override payroll stripped", sees(over, "payroll"), false);

// Per-person access.
const viewer = resolveAccess({ role: "Admin", payrollAccess: "view" });
eq("view: sees, cannot manage", [sees(viewer, "payroll"), manages(viewer, "payroll"), viewer.payroll], [true, false, "view"]);
const mgr = resolveAccess({ role: "Volunteer", payrollAccess: "manage" });
eq("manage: sees and manages", [sees(mgr, "payroll"), manages(mgr, "payroll"), sees(mgr, "staff"), manages(mgr, "staff")], [true, true, true, true]);
eq("junk access value ignored", resolveAccess({ role: "Admin", payrollAccess: "admin" }).payroll, null);

// Owner (decision 1: yes).
const owner = resolveAccess({ role: "Owner", isOwner: true, ownerGetsPayroll: true });
eq("Owner manages payroll", [sees(owner, "payroll"), manages(owner, "payroll"), owner.payroll], [true, true, "manage"]);
eq("Owner off when decided no", resolveAccess({ role: "Owner", isOwner: true, ownerGetsPayroll: false }).payroll, null);

// "*" and parent widening never reach private sections.
eq("star does not grant payroll", granted(["*"], "payroll"), false);
eq("settings parent does not grant payroll", granted(["settings"], "payroll"), false);
eq("support session (ALL_MODULES) has no payroll", hasSection({ sections: [...ALL_MODULES] }, "payroll"), false);
eq("support session still sees staff", hasSection({ sections: [...ALL_MODULES] }, "staff"), true);
eq("private list", PRIVATE_SECTIONS, ["payroll", "my-pay"]);

// Staff portal login: My pay only.
const portal = resolveAccess({ role: "Volunteer", staffPortalOnly: true, payrollAccess: "manage" });
eq("portal only my-pay", [portal.sections, portal.payroll, sees(portal, "people"), sees(portal, "my-pay")], [["my-pay"], null, false, true]);
eq("linked team member gets my-pay", sees(resolveAccess({ role: "Leader", hasStaffLink: true }), "my-pay"), true);
eq("unlinked person has no my-pay", sees(resolveAccess({ role: "Leader" }), "my-pay"), false);
eq("plan lock removes payroll", resolveAccess({ role: "Owner", isOwner: true, payrollLocked: true }).payroll, null);

// Plan gating.
eq("staff section needs payroll feature", featureForSection("staff"), "payroll");
eq("my-pay section needs payroll feature", featureForSection("my-pay"), "payroll");
eq("payroll section feature", featureForSection("payroll"), "payroll");
eq("routes map to payroll", ["/app/staff", "/app/payroll", "/app/my-pay"].map(getRouteFeature), ["payroll", "payroll", "payroll"]);
eq("Pro has no payroll", planHasFeature("pro", "payroll"), false);
eq("Max has payroll", planHasFeature("max", "payroll"), true);
eq("payroll is added later", FEATURES_ADDED_LATER.includes("payroll"), true);

// Saved planDefs without "payroll" in knownFeatures: Max inherits it, Pro does not. Same rule as resolvePlans().
function inherit(id: PlanId, savedFeatures: string[], knownFeatures?: string[]) {
  const known = new Set(knownFeatures ?? ALL_FEATURES.filter((f) => !FEATURES_ADDED_LATER.includes(f)));
  const inherited = DEFAULT_PLAN_TABLE[id].features.filter((f) => !known.has(f) && !savedFeatures.includes(f));
  return [...savedFeatures, ...inherited];
}
eq("saved Max inherits payroll", inherit("max", ["people"]).includes("payroll"), true);
eq("saved Pro does not get payroll", inherit("pro", ["people"]).includes("payroll"), false);
eq("SuperAdmin unticking payroll after seeing it sticks", inherit("max", ["people"], [...ALL_FEATURES]).includes("payroll"), false);

console.log(`\npayroll access: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
