/**
 * Pure tests for the Mobile Money checkout (no database, no network).
 * Run: npx tsx scripts/qa/momo.test.ts
 */
import assert from "node:assert/strict";
import { toLocalGhanaMobile, detectNetwork, isValidGhanaMobile, MOMO_NETWORKS, MOMO_NETWORK_IDS } from "../../src/lib/momo/networks";
import { signMomoToken, openMomoToken, MOMO_TOKEN_TTL_MS } from "../../src/lib/billing/momo-token";
import { mapChargeResponse } from "../../src/lib/momo/charge-status";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${(e as Error).message}`);
  }
}

/* ── networks.ts ── */
const PREFIXES: Record<string, string[]> = {
  mtn: ["024", "054", "055", "059", "025", "053"],
  telecel: ["020", "050"],
  at: ["026", "056", "027", "057"],
};
for (const [net, list] of Object.entries(PREFIXES)) {
  for (const p of list) {
    const local = `${p}1234567`;
    const two = p.slice(1); // "24"
    test(`${p} -> ${net} (local)`, () => assert.equal(detectNetwork(local), net));
    test(`${p} -> ${net} (+233 with spaces)`, () => assert.equal(detectNetwork(`+233 ${two} 123 4567`), net));
    test(`${p} -> ${net} (233 no plus)`, () => assert.equal(detectNetwork(`233${two}1234567`), net));
    test(`${p} -> ${net} (spaced local)`, () => assert.equal(detectNetwork(`${p} 123 4567`), net));
    test(`${p} normalises from +233`, () => assert.equal(toLocalGhanaMobile(`+233${two}1234567`), local));
  }
}
test("constant prefixes match the table", () => {
  for (const id of MOMO_NETWORK_IDS) assert.deepEqual([...MOMO_NETWORKS[id].prefixes].sort(), [...PREFIXES[id]].sort());
});
test("paystack provider codes", () => {
  assert.equal(MOMO_NETWORKS.mtn.paystack, "mtn");
  assert.equal(MOMO_NETWORKS.telecel.paystack, "vod");
  assert.equal(MOMO_NETWORKS.at.paystack, "atl");
});
test("9-digit local without 0", () => assert.equal(toLocalGhanaMobile("241234567"), "0241234567"));
test("dashes and brackets", () => assert.equal(toLocalGhanaMobile("(024) 123-4567"), "0241234567"));
test("00233 prefix", () => assert.equal(toLocalGhanaMobile("00233241234567"), "0241234567"));
test("Paystack test number", () => {
  assert.equal(toLocalGhanaMobile("0551234987"), "0551234987");
  assert.equal(detectNetwork("0551234987"), "mtn");
});
test("landline refused (030)", () => assert.equal(toLocalGhanaMobile("0302123456"), null));
test("too short refused", () => assert.equal(toLocalGhanaMobile("024123456"), null));
test("too long refused", () => assert.equal(toLocalGhanaMobile("02412345678"), null));
test("foreign refused", () => assert.equal(toLocalGhanaMobile("+2348031234567"), null));
test("empty refused", () => {
  assert.equal(toLocalGhanaMobile(""), null);
  assert.equal(toLocalGhanaMobile(null), null);
  assert.equal(isValidGhanaMobile(undefined), false);
});
test("valid mobile with unknown prefix has no network", () => {
  assert.equal(isValidGhanaMobile("0281234567"), true);
  assert.equal(detectNetwork("0281234567"), null);
});
test("letters refused", () => assert.equal(toLocalGhanaMobile("abc"), null));

/* ── momo-token.ts ── */
const base = { reference: "whq-1763300000000-0123456789abcdef", churchId: "church_1", kind: "sms_topup" as const };
test("token round trip", () => {
  const o = openMomoToken(signMomoToken(base));
  assert.ok(o);
  assert.equal(o!.reference, base.reference);
  assert.equal(o!.churchId, base.churchId);
  assert.equal(o!.kind, base.kind);
});
test("token expires after 30 minutes", () => {
  const now = Date.now();
  const t = signMomoToken(base, now);
  assert.ok(openMomoToken(t, now + MOMO_TOKEN_TTL_MS - 1000));
  assert.equal(openMomoToken(t, now + MOMO_TOKEN_TTL_MS + 1000), null);
});
test("tampered body refused", () => {
  const sig = signMomoToken(base).split(".")[1];
  const forged = Buffer.from(JSON.stringify({ r: base.reference, c: "other_church", k: base.kind, e: Date.now() + 60_000 })).toString("base64url");
  assert.equal(openMomoToken(`${forged}.${sig}`), null);
});
test("tampered signature refused", () => {
  const t = signMomoToken(base);
  assert.equal(openMomoToken(t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA")), null);
});
test("unknown kind refused", () => {
  const [body, sig] = signMomoToken({ ...base, kind: "plan_upgrade" }).split(".");
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  data.k = "free_money";
  assert.equal(openMomoToken(`${Buffer.from(JSON.stringify(data)).toString("base64url")}.${sig}`), null);
});
test("garbage refused", () => {
  for (const g of ["", "x", ".", "a.b", "e30.abc", null, undefined]) assert.equal(openMomoToken(g as string), null);
});

/* ── mapChargeResponse ── */
test("pay_offline", () => assert.deepEqual(
  mapChargeResponse({ status: true, message: "Charge attempted", data: { reference: "r", status: "pay_offline", display_text: "Please complete authorization process on your mobile phone" } }),
  { status: "pay_offline", displayText: "Please complete authorization process on your mobile phone" },
));
test("send_otp", () => assert.deepEqual(
  mapChargeResponse({ status: true, message: "Charge attempted", data: { status: "send_otp", display_text: "Please dial *110# to generate a voucher code" } }),
  { status: "send_otp", displayText: "Please dial *110# to generate a voucher code" },
));
test("success", () => assert.deepEqual(mapChargeResponse({ status: true, data: { status: "success", amount: 100 } }), { status: "success" }));
test("pending", () => assert.deepEqual(mapChargeResponse({ status: true, data: { status: "pending" } }), { status: "pending" }));
test("failed uses gateway_response", () => assert.deepEqual(
  mapChargeResponse({ status: true, message: "Charge attempted", data: { status: "failed", gateway_response: "Insufficient funds" } }),
  { status: "failed", message: "Insufficient funds" },
));
test("failed with only top message", () => assert.deepEqual(mapChargeResponse({ status: true, message: "Declined", data: { status: "failed" } }), { status: "failed", message: "Declined" }));
test("abandoned is failed", () => assert.equal(mapChargeResponse({ status: true, data: { status: "abandoned" } }).status, "failed"));
test("unknown send_pin is pending with text", () => assert.deepEqual(
  mapChargeResponse({ status: true, data: { status: "send_pin", display_text: "Enter PIN" } }),
  { status: "pending", displayText: "Enter PIN" },
));
test("open_url is pending", () => assert.equal(mapChargeResponse({ status: true, data: { status: "open_url", url: "https://x" } }).status, "pending"));
test("refused request is failed with message", () => assert.deepEqual(
  mapChargeResponse({ status: false, message: "Invalid Mobile Money number" }),
  { status: "failed", message: "Invalid Mobile Money number" },
));
test("empty or junk is error", () => {
  assert.equal(mapChargeResponse(null).status, "error");
  assert.equal(mapChargeResponse("oops").status, "error");
  assert.equal(mapChargeResponse({}).status, "error");
});
test("uppercase status", () => assert.equal(mapChargeResponse({ status: true, data: { status: "SUCCESS" } }).status, "success"));

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error("  FAIL " + f);
  process.exit(1);
}
