/**
 * Africa's Talking sending, with fetch faked: no SMS leaves this machine and nothing is written (logged: true).
 *   npx tsx --require ./scripts/qa/preload-session.cjs --env-file=.env scripts/qa/africastalking.qa.ts
 */
process.env.AFRICASTALKING_USERNAME = "qa-user";
process.env.AFRICASTALKING_API_KEY = "qa-key";

let pass = 0, fail = 0;
const ok = (cond: unknown, msg: string) => { if (cond) { pass++; console.log("  PASS", msg); } else { fail++; console.log("  FAIL", msg); } };

const calls: { url: string; headers: Record<string, string>; body: URLSearchParams }[] = [];
let reply: () => Response = () => new Response("{}");
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes("africastalking.com")) throw new Error(`Blocked unexpected request to ${url}`);
  calls.push({ url, headers: init?.headers as Record<string, string>, body: new URLSearchParams(String(init?.body)) });
  return reply();
}) as typeof fetch;

(async () => {
  const { sendSms } = await import("@/lib/integrations/sms");

  console.log("1. Two numbers, one accepted and one refused");
  reply = () => new Response(JSON.stringify({ SMSMessageData: { Message: "Sent to 1/2 Total Cost: KES 0.8000", Recipients: [
    { number: "+254711000001", statusCode: 101, status: "Success", cost: "KES 0.8000", messageId: "ATXid_1" },
    { number: "+2348030000002", statusCode: 403, status: "InvalidPhoneNumber", cost: "0", messageId: "None" },
  ] } }), { status: 201 });
  const r = await sendSms(["+254711000001", "+2348030000002"], "Hello", { carrier: "africastalking", heading: null, logged: true, international: true });
  const c = calls[0];
  ok(c?.url === "https://api.africastalking.com/version1/messaging", `live endpoint (${c?.url})`);
  ok(c?.headers.apiKey === "qa-key" && c?.body.get("username") === "qa-user", "key and username sent");
  ok(c?.body.get("to") === "+254711000001,+2348030000002", `numbers with + (${c?.body.get("to")})`);
  ok(!c?.body.has("from"), "no sender name while none is set");
  ok(r.sentCount === 1 && r.results[0].ok && !r.results[1].ok, "per-number outcome kept");
  ok(r.results[0].id === "ATXid_1", "message id kept");
  ok(/InvalidPhoneNumber/.test(r.results[1].error ?? ""), `refusal reason shown (${r.results[1].error})`);
  ok(r.providerCost === "Sent to 1/2 Total Cost: KES 0.8000", "carrier's cost line passed back");

  console.log("2. A bad key");
  calls.length = 0;
  reply = () => new Response("The supplied authentication is invalid", { status: 401 });
  const bad = await sendSms("+254711000001", "Hello", { carrier: "africastalking", heading: null, logged: true, international: true });
  ok(!bad.ok && /401/.test(bad.error ?? ""), `refused with the reason (${bad.error})`);

  console.log("3. WorshipHQ name line added when sent under Africa's Talking's own name");
  calls.length = 0;
  reply = () => new Response(JSON.stringify({ SMSMessageData: { Message: "Sent to 1/1", Recipients: [{ number: "+254711000001", statusCode: 101, status: "Success", messageId: "x" }] } }), { status: 201 });
  await sendSms("+254711000001", "Hello", { carrier: "africastalking", logged: true, international: true });
  ok(calls[0]?.body.get("message") === "WorshipHQ\nHello", `branded (${JSON.stringify(calls[0]?.body.get("message"))})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
