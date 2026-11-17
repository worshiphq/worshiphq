/**
 * Pure tests for the Mobile Money checkout (no database, no network).
 * Run: npx tsx scripts/qa/momo.test.ts
 */
import assert from "node:assert/strict";
import { toLocalGhanaMobile, detectNetwork, isValidGhanaMobile, MOMO_NETWORKS, MOMO_NETWORK_IDS } from "../../src/lib/momo/networks";
import { signMomoToken, openMomoToken, MOMO_TOKEN_TTL_MS } from "../../src/lib/billing/momo-token";
import { mapChargeResponse } from "../../src/lib/momo/charge-status";
import { prefixMismatch } from "../../src/lib/momo/networks";
import {
  bankCodesFromList, networkForBankRow, resolveOrder, readResolveReply, resolveAcrossNetworks, explainMomoFailure, FALLBACK_BANK_CODES,
  type ResolveAttempt,
} from "../../src/lib/momo/name-check";

let passed = 0;
const pending: Promise<void>[] = [];
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

/* ── name check: bank codes ── */
function atest(name: string, fn: () => Promise<void>) {
  pending.push(fn().then(() => { passed++; }, (e) => { failures.push(`${name}: ${(e as Error).message}`); }));
}

test("fallback bank codes", () => assert.deepEqual(FALLBACK_BANK_CODES, { mtn: "MTN", telecel: "VOD", at: "ATL" }));
test("bank list maps codes", () => assert.deepEqual(
  bankCodesFromList({ status: true, data: [
    { name: "MTN", code: "MTN", type: "mobile_money", currency: "GHS", active: true },
    { name: "Vodafone", code: "VOD", type: "mobile_money", currency: "GHS" },
    { name: "AirtelTigo", code: "ATL", type: "mobile_money", currency: "GHS" },
  ] }),
  { mtn: "MTN", telecel: "VOD", at: "ATL" },
));
test("bank list with new codes wins over fallback", () => assert.deepEqual(
  bankCodesFromList({ data: [
    { name: "MTN Mobile Money", code: "MTN-GH", type: "mobile_money", currency: "GHS" },
    { name: "Telecel Cash", code: "TCL", type: "mobile_money", currency: "GHS" },
    { name: "AT Money", slug: "at-money", code: "AT1", type: "mobile_money", currency: "GHS" },
  ] }),
  { mtn: "MTN-GH", telecel: "TCL", at: "AT1" },
));
test("bank list keeps fallback for missing networks", () => assert.deepEqual(
  bankCodesFromList({ data: [{ name: "MTN", code: "MTN", type: "mobile_money", currency: "GHS" }] }),
  { mtn: "MTN", telecel: "VOD", at: "ATL" },
));
test("bank list skips banks, other currencies, inactive and deleted rows", () => assert.deepEqual(
  bankCodesFromList({ data: [
    { name: "MTN Bank", code: "XX1", type: "ghipss", currency: "GHS" },
    { name: "MTN", code: "MTN-KE", type: "mobile_money", currency: "KES" },
    { name: "Vodafone", code: "OLD", type: "mobile_money", currency: "GHS", is_deleted: true },
    { name: "AirtelTigo", code: "TGO", type: "mobile_money", currency: "GHS", active: false },
  ] }),
  FALLBACK_BANK_CODES,
));
test("first matching row wins", () => assert.equal(
  bankCodesFromList({ data: [
    { name: "AirtelTigo", code: "ATL", type: "mobile_money", currency: "GHS" },
    { name: "Tigo", code: "TGO", type: "mobile_money", currency: "GHS" },
  ] }).at,
  "ATL",
));
test("junk bank list falls back", () => {
  assert.deepEqual(bankCodesFromList(null), FALLBACK_BANK_CODES);
  assert.deepEqual(bankCodesFromList({ data: "nope" }), FALLBACK_BANK_CODES);
  assert.deepEqual(bankCodesFromList({ data: [null, 5, { code: "ZZZ", name: "Unknown" }] }), FALLBACK_BANK_CODES);
});
test("networkForBankRow", () => {
  assert.equal(networkForBankRow({ code: "vod" }), "telecel");
  assert.equal(networkForBankRow({ code: "TGO" }), "at");
  assert.equal(networkForBankRow({ name: "GCB Bank", code: "040" }), null);
});

/* ── name check: order ── */
test("order: chosen, detected, rest", () => assert.deepEqual(resolveOrder("telecel", "mtn"), ["telecel", "mtn", "at"]));
test("order: chosen equals detected", () => assert.deepEqual(resolveOrder("mtn", "mtn"), ["mtn", "telecel", "at"]));
test("order: nothing chosen", () => assert.deepEqual(resolveOrder(null, "at"), ["at", "mtn", "telecel"]));
test("order: nothing known", () => assert.deepEqual(resolveOrder(null, null), ["mtn", "telecel", "at"]));
test("prefix mismatch", () => {
  assert.equal(prefixMismatch("0241234567", "telecel"), "mtn");
  assert.equal(prefixMismatch("0241234567", "mtn"), null);
  assert.equal(prefixMismatch("0281234567", "mtn"), null);
  assert.equal(prefixMismatch("0241234567", null), null);
});

/* ── name check: resolve replies ── */
test("resolve found", () => assert.deepEqual(
  readResolveReply(200, { status: true, message: "Account number resolved", data: { account_number: "0241234567", account_name: "KOFI  MENSAH " } }),
  { kind: "found", name: "KOFI MENSAH" },
));
test("resolve 422 is not found", () => assert.deepEqual(readResolveReply(422, { status: false, message: "Could not resolve account name" }), { kind: "not_found" }));
test("resolve 400 is not found", () => assert.equal(readResolveReply(400, { status: false }).kind, "not_found"));
test("resolve 500 / 429 / 401 is unavailable", () => {
  assert.equal(readResolveReply(500, {}).kind, "unavailable");
  assert.equal(readResolveReply(429, {}).kind, "unavailable");
  assert.equal(readResolveReply(401, { status: false, message: "Invalid key" }).kind, "unavailable");
});
test("resolve 200 without a name is unavailable", () => assert.equal(readResolveReply(200, { status: true, data: {} }).kind, "unavailable"));

const fake = (answers: Partial<Record<string, ResolveAttempt | "throw">>) => {
  const asked: string[] = [];
  const fn = async (id: string): Promise<ResolveAttempt> => {
    asked.push(id);
    const a = answers[id] ?? { kind: "not_found" };
    if (a === "throw") throw new Error("boom");
    return a;
  };
  return { asked, fn };
};
atest("resolve: chosen network found, no switch", async () => {
  const f = fake({ mtn: { kind: "found", name: "KOFI MENSAH" } });
  assert.deepEqual(await resolveAcrossNetworks("mtn", "mtn", f.fn), { status: "found", name: "KOFI MENSAH", network: "mtn", switched: false, chosen: "mtn" });
  assert.deepEqual(f.asked, ["mtn"]);
});
atest("resolve: MTN number picked as Telecel switches to MTN", async () => {
  const f = fake({ telecel: { kind: "not_found" }, mtn: { kind: "found", name: "KOFI MENSAH" } });
  const r = await resolveAcrossNetworks("telecel", "mtn", f.fn);
  assert.deepEqual(r, { status: "found", name: "KOFI MENSAH", network: "mtn", switched: true, chosen: "telecel" });
  assert.deepEqual(f.asked, ["telecel", "mtn"]);
});
atest("resolve: ported number found on the last network", async () => {
  const f = fake({ at: { kind: "found", name: "AMA" } });
  const r = await resolveAcrossNetworks("mtn", "mtn", f.fn);
  assert.equal(r.status === "found" && r.network, "at");
  assert.deepEqual(f.asked, ["mtn", "telecel", "at"]);
});
atest("resolve: nowhere is not_found", async () => {
  const f = fake({});
  assert.deepEqual(await resolveAcrossNetworks("mtn", "mtn", f.fn), { status: "not_found" });
  assert.deepEqual(f.asked, ["mtn", "telecel", "at"]);
});
atest("resolve: chosen unavailable stops and lets them go on", async () => {
  const f = fake({ telecel: { kind: "unavailable" }, mtn: { kind: "found", name: "X" } });
  assert.deepEqual(await resolveAcrossNetworks("telecel", "mtn", f.fn), { status: "unavailable" });
  assert.deepEqual(f.asked, ["telecel"]);
});
atest("resolve: a throw counts as unavailable", async () => {
  const f = fake({ mtn: "throw" });
  assert.deepEqual(await resolveAcrossNetworks("mtn", null, f.fn), { status: "unavailable" });
});
atest("resolve: later network unavailable, none found, is unavailable", async () => {
  const f = fake({ telecel: { kind: "unavailable" } });
  assert.deepEqual(await resolveAcrossNetworks("mtn", "mtn", f.fn), { status: "unavailable" });
  assert.deepEqual(f.asked, ["mtn", "telecel", "at"]);
});

/* ── failure messages ── */
const wrong = (m: string) => explainMomoFailure(m, "Telecel Cash");
for (const m of ["Invalid mobile number", "Invalid MoMo number", "Number not registered for mobile money", "Subscriber not found", "Account does not exist", "Wallet not found", "Could not resolve account", "Wrong network"]) {
  test(`wrong network: ${m}`, () => assert.deepEqual(wrong(m), { text: "This number may not be on Telecel Cash. Check the network and try again.", wrongNetwork: true }));
}
test("insufficient funds", () => assert.match(explainMomoFailure("Insufficient funds", "MTN MoMo").text, /isn't enough money/));
test("not enough balance", () => assert.match(explainMomoFailure("Not enough balance").text, /isn't enough money/));
test("wrong PIN is not wrong network", () => {
  const r = explainMomoFailure("Invalid PIN", "MTN MoMo");
  assert.equal(r.wrongNetwork, false);
  assert.match(r.text, /PIN/);
});
test("timeout", () => assert.match(explainMomoFailure("Transaction timed out").text, /approved in time/));
test("declined by user", () => assert.match(explainMomoFailure("Transaction declined by customer").text, /declined/));
test("limit", () => assert.match(explainMomoFailure("Daily limit exceeded").text, /limit/));
test("blocked wallet", () => assert.match(explainMomoFailure("Account blocked").text, /can't make payments/));
test("bare declined / failed / empty", () => {
  assert.match(explainMomoFailure("Declined").text, /declined on the phone/);
  assert.equal(explainMomoFailure(undefined).text, "Please try again.");
});
test("unknown message is quoted", () => assert.equal(explainMomoFailure("Something odd happened.").text, 'Your network said: "Something odd happened". Please try again.'));
test("no network label", () => assert.match(explainMomoFailure("Invalid number").text, /this network/));
test("no em dashes in messages", () => {
  for (const m of ["Invalid number", "Insufficient funds", "Invalid PIN", "timeout", "declined", "limit", "blocked", "x"]) assert.ok(!explainMomoFailure(m, "MTN MoMo").text.includes("\u2014"));
});

void Promise.all(pending).then(() => {
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error("  FAIL " + f);
    process.exit(1);
  }
});
