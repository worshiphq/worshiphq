/**
 * The church's signed authorization for online giving. Paystack asks for a signed and stamped letter from every church
 * we collect for, so each church downloads the letter, has it signed and stamped, and uploads the scan when it applies.
 * It also accepts the agreement inside the app (typed signature), which we keep as our own record.
 */

/** Bump this when the wording of the letter or agreement changes, so we know which version each church accepted. */
export const AUTHORIZATION_TERMS_VERSION = "1";

/** The business the church authorizes. Change here when the business registration comes through. */
export const COLLECTING_BUSINESS_NAME = "Wodona Tech (WorshipHQ)";

export const MAX_LETTER_BYTES = 4 * 1024 * 1024; // 4 MB: a phone photo or scanned page
export const LETTER_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export function isLetterType(t: string): boolean {
  return (LETTER_TYPES as readonly string[]).includes(t);
}

export type LetterDetails = {
  churchName: string;
  accountType?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  date: Date;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The printable authorization letter (opens in a new tab; the church prints it or saves it as a PDF). */
export function authorizationLetterHtml(d: LetterDetails): string {
  const acct = d.accountNumber
    ? `${esc(d.accountType === "momo" ? "Mobile Money" : "Bank account")}: ${esc(d.bankName ?? "")}, ${esc(d.accountNumber)}, in the name of ${esc(d.accountName ?? "")}`
    : "Account: ______________________________________________";
  const date = d.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Online giving authorization letter</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:760px;margin:0 auto;padding:40px 32px;line-height:1.6;font-size:15px}
  .bar{font-family:Arial,sans-serif;background:#eef6f6;border:1px solid #cfe3e3;padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:28px}
  .bar button{margin-left:8px;padding:6px 12px;border:0;border-radius:6px;background:#0f8a8a;color:#fff;cursor:pointer}
  h1{font-size:19px;margin:0 0 4px} .muted{color:#555} .sig{margin-top:56px;display:flex;gap:40px;flex-wrap:wrap}
  .sig div{flex:1;min-width:220px;border-top:1px solid #111;padding-top:6px;font-size:13px}
  .stamp{margin-top:28px;border:1px dashed #888;height:110px;width:220px;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px}
  @media print{.bar{display:none}body{padding:0}}
</style></head><body>
<div class="bar">Print this letter, have the church leader sign it and stamp it with the church stamp, then upload a clear photo or scan when you apply for online giving.
<button onclick="window.print()">Print or save as PDF</button></div>
<p class="muted">${esc(date)}</p>
<h1>AUTHORIZATION TO PROCESS ONLINE GIVING</h1>
<p class="muted">To: Paystack and ${esc(COLLECTING_BUSINESS_NAME)}</p>
<p>We, <strong>${esc(d.churchName)}</strong>, hereby authorize <strong>${esc(COLLECTING_BUSINESS_NAME)}</strong> to collect and process online gifts, offerings, tithes and other contributions made to our church through the WorshipHQ platform, using Paystack, on our behalf.</p>
<p>We confirm that all such payments are to be settled directly into the following account, which belongs to our church:</p>
<p><strong>${acct}</strong></p>
<p>We understand that WorshipHQ keeps a small platform fee as agreed in its terms for online giving, that we may ask to change the payout account only through our authorized leaders, and that we may withdraw this authorization at any time by writing to WorshipHQ.</p>
<p>We confirm that the person signing below is a leader of this church with the authority to give this authorization.</p>
<div class="sig"><div>Name of church leader<br><br>Title (e.g. Pastor, Treasurer)</div><div>Signature &amp; date</div></div>
<div class="stamp">Church stamp</div>
</body></html>`;
}
