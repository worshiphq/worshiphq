import { shell, phone, card, stat, table, badge, btn, av, bar, field, tabs, chips, seg, filters, n, KIDS, ghs } from "./lib.mjs";

export const pages = [];
const add = (p) => pages.push(p);
const FT = ["Fee structure", "Invoices", "Payments", "Debtors", "Collections"];

// ───────── Fees ─────────
add({
  id: "W26", slug: "fee-structure", group: "6 · Fees & payments", title: "Fee structure (term × level)", route: "/fees/structure", roles: "Admin, Bursar",
  html: shell({ role: "bursar", active: "Fee structure", title: "Fee structure — Term 2, 2026/2027", crumb: "Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Copy from Term 1", "") + btn("Increase by %…", "") + btn("Save", "p"),
    content: `${table(["Fee item", "Nursery 1–2", "KG 1–2", "Primary 1–3", "Primary 4–6", "JHS 1–3", "Applies to"], [
      ["Tuition", ...[450, 480, 560, 600, 720].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v.toFixed(2)}</div>`), "All"],
      ["PTA levy", ...[40, 40, 50, 50, 60].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v.toFixed(2)}</div>`), "All"],
      ["Feeding", ...[220, 220, 250, 250, 280].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v.toFixed(2)}</div>`), "All · optional"],
      ["Books", ...[60, 80, 100, 100, 120].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v.toFixed(2)}</div>`), "All"],
      ["ICT", ...["—", "—", 30, 50, 60].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v === "—" ? v : v.toFixed(2)}</div>`), "All"],
      ["Admission / Registration", ...[150, 150, 200, 200, 250].map((v) => `<div class="inp" style="justify-content:flex-end;min-height:30px">${v.toFixed(2)}</div>`), "New students only"],
      ["<b>Total (continuing)</b>", ...["770.00", "820.00", "990.00", "1,050.00", "1,240.00"].map((v) => `<b>${v}</b>`), ""]], { cls: ["", "r", "r", "r", "r", "r", ""] })}
    <div class="mt small muted">+ Add fee item · Changes apply to invoices generated <b>after</b> saving; existing invoices are not rewritten.</div>` }),
  notes: [`${n(1)}Grid = fee item × level group for the selected term. "Copy from last term" + "increase by %" make the term-start chore two clicks.`, `${n(2)}New-student-only items (admission) are excluded from continuing pupils' invoices.`, `${n(3)}Saving never edits issued invoices — that avoids silent changes to what parents already owe.`],
  reqs: ["FR-FEE-01", "FR-FEE-02", "FR-FEE-03"],
});

add({
  id: "W27", slug: "invoice-generate", group: "6 · Fees & payments", title: "Generate term invoices (preview)", route: "/fees/invoices/generate", roles: "Admin, Bursar",
  html: shell({ role: "bursar", active: "Invoices", title: "Generate Term 2 invoices", crumb: "Fees / Invoices", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Back", "") + btn("Generate 412 invoices", "p"),
    content: `<div class="row" style="margin-bottom:14px">${["1 Scope", "2 Preview", "3 Generate"].map((s, i) => `<span class="chip ${i === 1 ? "on" : ""}">${s}</span>`).join("")}</div>
    <div class="grid c4">${stat("Invoices to create", "412")}${stat("Total billed", ghs(412350))}${stat("Arrears brought forward", ghs(23800), "from 61 pupils", "warn")}${stat("Discounts applied", ghs(9420), "37 pupils")}</div>
    <div class="grid g21 mt">${table(["Pupil", "Class", "Fees", "Arrears b/f", "Discount", "Total"], [
      ["Kwame Mensah", "P4 A", ghs(1050), ghs(0), "<span style='color:var(--good)'>−" + ghs(60) + "</span>", "<b>" + ghs(990) + "</b>"], ["Kofi Owusu", "P4 A", ghs(1050), "<b style='color:var(--bad)'>" + ghs(450) + "</b>", ghs(0), "<b>" + ghs(1500) + "</b>"],
      ["Akosua Mensah", "KG 2", ghs(820), ghs(0), "<span style='color:var(--good)'>−" + ghs(82) + "</span>", "<b>" + ghs(738) + "</b>"], ["Yaw Asante", "JHS 1 B", ghs(1240), ghs(0), ghs(0), "<b>" + ghs(1240) + "</b>"]], { cls: ["", "", "r", "r", "r", "r"] })}
    ${card("Scope", field("Term", "Term 2 · 2026/2027", { sel: true }) + field("Applies to", "Whole school", { sel: true }) + field("Issue date", "12 Jan 2027") + field("Due date", "11 Feb 2027", { hint: "Issue date + 30 days (Settings → Policies)" }) + `<div class="hint">Safe to re-run: pupils who already have a Term 2 invoice are skipped (no double billing).</div>`)}</div>` }),
  notes: [`${n(1)}Always previews totals before creating; idempotent per pupil × term.`, `${n(2)}Arrears (unpaid balance from earlier terms) are carried as a single line on the new invoice, once.`, `${n(3)}Active discounts (sibling, scholarship) apply automatically and show as negative lines.`],
  reqs: ["FR-FEE-04", "FR-FEE-05"],
});

add({
  id: "W28", slug: "invoices-list", group: "6 · Fees & payments", title: "Invoices list & detail", route: "/fees/invoices", roles: "Admin, Bursar, Head(read)",
  html: shell({ role: "bursar", active: "Invoices", title: "Invoices — Term 2", crumb: "Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Generate invoices", "p"),
    content: `${filters([`<div class="inp" style="min-width:240px">Search pupil / invoice no.</div>`, "Class: All", "Status: Any", "Due: Any"])}
    <div class="grid g21"><div>${table(["Invoice", "Pupil", "Total", "Paid", "Balance", "Status"], [
      ["INV-2027-0412", "Kwame Mensah", ghs(990), ghs(990), ghs(0), badge("Paid", "good")], ["INV-2027-0415", "Kofi Owusu", ghs(1500), ghs(300), "<b>" + ghs(1200) + "</b>", badge("Partial", "warn")],
      ["INV-2027-0433", "Akosua Mensah", ghs(738), ghs(0), "<b>" + ghs(738) + "</b>", badge("Due in 2 days", "warn")], ["INV-2027-0421", "Yaw Asante", ghs(1240), ghs(1240), ghs(0), badge("Paid", "good")]], { cls: ["", "", "r", "r", "r", ""] })}</div>
    ${card("INV-2027-0415 · Kofi Owusu", `<table style="font-size:12.5px">${[["Tuition", 600], ["PTA", 50], ["Feeding", 250], ["Books", 100], ["ICT", 50], ["Arrears b/f (Term 1)", 450]].map(([a, b]) => `<tr><td>${a}</td><td class="r">${ghs(b)}</td></tr>`).join("")}<tr><td class="b">Total</td><td class="r b">${ghs(1500)}</td></tr><tr><td>Paid</td><td class="r">${ghs(300)}</td></tr><tr><td class="b">Balance</td><td class="r b" style="color:var(--bad)">${ghs(1200)}</td></tr></table><div class="mt2 row">${btn("Record payment", "p s")}${btn("Add adjustment", "s")}${btn("Cancel", "s")}</div>`)}</div>` }),
  notes: [`${n(1)}Detail panel shows lines, payments allocated and offers adjustment (add excursion fee / waive charge) with mandatory reason.`, `${n(2)}Cancelling never deletes — invoice shows Cancelled and can be re-issued.`],
  reqs: ["FR-FEE-05", "FR-FEE-06"],
});

add({
  id: "W29", slug: "record-payment", group: "6 · Fees & payments", title: "Record payment (bursar)", route: "/fees/payments/new", roles: "Admin, Bursar",
  html: shell({ role: "bursar", active: "Payments", title: "Record payment", crumb: "Fees / Payments", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Cancel", ""),
    content: `<div class="grid g21"><div>${card("1 · Pupil", `<div class="inp" style="min-width:260px">Kofi Owusu · BFA-0415 · P4 A</div><div class="mt2 small muted">Guardian: Mr. J. Owusu · +233 20 123 4567</div>`)}
    <div class="mt">${card("2 · Payment", `<div class="grid c3">${field("Amount (GH₵)", "700.00")}${field("Method", "Mobile money", { sel: true })}${field("Network", "MTN MoMo", { sel: true })}${field("Transaction ID / slip no.", "MP260209.1124.A1")}${field("Paid by (name)", "Mr. J. Owusu")}${field("Date", "09 Feb 2027")}</div>${field("Note", "", { ph: "Optional" })}`)}</div>
    <div class="mt">${card("3 · Allocation (oldest first)", table(["Invoice", "Balance", "Apply"], [["Term 1 arrears (in Term 2 invoice)", ghs(1200), "<b>" + ghs(700) + "</b>"]], { cls: ["", "r", "r"] }) + `<div class="small muted mt2">Remaining credit: ${ghs(0)} · Balance after: <b>${ghs(500)}</b></div>`)}</div></div>
    ${card("Receipt preview", `<div class="b">R-2027-0874</div><div class="small muted">Kofi Owusu · P4 A</div><div class="hr"></div><div class="row"><span class="sp">Amount received</span><b>${ghs(700)}</b></div><div class="row"><span class="sp">Balance</span><b>${ghs(500)}</b></div><div class="mt">${btn("Save & print receipt", "p w")}</div><div class="mt2">${btn("Save & SMS receipt", "w")}</div>`)}</div>` }),
  notes: [`${n(1)}Receipt numbers are sequential per school per year, generated inside the same transaction as the payment — no gaps or duplicates.`, `${n(2)}Allocation defaults to oldest unpaid invoice first; remainder (overpayment) is kept as student credit.`, `${n(3)}Bursar can't edit or delete a saved payment — only reverse it with a reason (admin permission).`],
  reqs: ["FR-FEE-07", "FR-FEE-08", "FR-FEE-10", "FR-FEE-11"],
});

add({
  id: "W30", slug: "receipt", group: "6 · Fees & payments", title: "Receipt (A5 / thermal)", route: "/fees/payments/[id]/receipt", roles: "Admin, Bursar, Parent", width: 700,
  html: `<div class="sheet" style="width:480px;padding:26px 30px"><div class="c"><div style="font-size:18px;font-weight:800">BRIGHT FUTURE ACADEMY</div><div class="small">P. O. Box 214, Kumasi · 024 000 1112</div><div class="b" style="margin-top:8px;letter-spacing:.12em">OFFICIAL RECEIPT</div></div>
   <div class="row small" style="margin:12px 0"><div class="sp"><b>Receipt no:</b> R-2027-0874</div><div><b>Date:</b> 09 Feb 2027</div></div>
   <div class="small"><b>Received from:</b> Mr. J. Owusu<br><b>For pupil:</b> Kofi Owusu · BFA-0415 · Primary 4 A<br><b>Term:</b> Term 2, 2026/2027</div>
   <table style="margin:12px 0;font-size:12.5px"><tr><td>Payment (MTN MoMo · MP260209.1124.A1)</td><td class="r b">${ghs(700)}</td></tr><tr><td class="muted">Applied to INV-2027-0415</td><td class="r">${ghs(700)}</td></tr></table>
   <div class="hr"></div><div class="row"><span class="sp b">Balance outstanding</span><b style="font-size:16px">${ghs(500)}</b></div>
   <div class="row small" style="margin-top:22px"><div class="sp">Received by: Kojo Mensima</div><div style="width:70px;height:70px;border:1px dashed #999;display:grid;place-items:center">QR</div></div>
   <div class="small muted c" style="margin-top:10px">Keep this receipt. Scan to verify authenticity.</div></div>`,
  notes: [`${n(1)}Shows balance after payment so parent and bursar agree on the spot; QR verifies the receipt online.`, `${n(2)}Same data renders as SMS ("Receipt R-2027-0874: GH₵700 received for Kofi Owusu. Balance GH₵500.").`],
  reqs: ["FR-FEE-08"],
});

add({
  id: "W31", slug: "student-statement", group: "6 · Fees & payments", title: "Student fee statement", route: "/students/[id]/fees", roles: "Admin, Bursar, Parent(own child)",
  html: shell({ role: "bursar", active: "Students", title: "Statement — Kofi Owusu", crumb: "Students / BFA-0415 / Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Print", "") + btn("SMS reminder", "") + btn("Record payment", "p"),
    content: `<div class="grid c4">${stat("Billed (all terms)", ghs(2550))}${stat("Paid", ghs(1350), "", "good")}${stat("Balance", ghs(1200), "", "bad")}${stat("Credit", ghs(0))}</div>
    <div class="mt">${table(["Date", "Ref", "Description", "Debit", "Credit", "Balance"], [
      ["08 Sep 2026", "INV-2026-0415", "Term 1 fees", ghs(1050), "", ghs(1050)], ["15 Sep 2026", "R-2026-0112", "Cash", "", ghs(600), ghs(450)],
      ["12 Jan 2027", "INV-2027-0415", "Term 2 fees (+ arrears carried as line)", ghs(1050), "", ghs(1500)], ["20 Jan 2027", "R-2027-0301", "MoMo", "", ghs(300), ghs(1200)]], { cls: ["", "", "", "r", "r", "r"] })}</div>
    <div class="small muted mt2">Arrears of GH₵450 are carried into the Term 2 invoice line; ledger view avoids double-counting.</div>` }),
  notes: [`${n(1)}Running balance ledger the parent can understand; reversal rows appear in red with the reason.`, `${n(2)}Same view (read-only) is what the parent sees in the portal.`],
  reqs: ["FR-FEE-12"],
});

add({
  id: "W32", slug: "debtors", group: "6 · Fees & payments", title: "Debtors & reminders", route: "/fees/debtors", roles: "Admin, Bursar, Head",
  html: shell({ role: "bursar", active: "Debtors", title: "Debtors — Term 2", crumb: "Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Export Excel", "") + btn("SMS reminder to selected (23)", "p"),
    content: `<div class="grid c4">${stat("Owing pupils", "142", "of 412")}${stat("Total owed", ghs(78800), "", "bad")}${stat("Overdue > 30 days", ghs(38950), "46 pupils")}${stat("Reminders sent last 7 d", "58")}</div>
    <div class="mt">${filters(["Class: All", "Balance ≥ GH₵ 200", "Age: any", "Last reminder: any"])}${table(["", "Pupil", "Class", "Guardian", "Balance", "Overdue", "Last reminder", ""], [
      ["☑", "Kofi Owusu", "P4 A", "+233 20 123 4567", "<b style='color:var(--bad)'>" + ghs(1200) + "</b>", "42 days", "03 Feb", btn("Statement", "s")], ["☑", "Akosua Mensah", "KG 2", "+233 24 555 0147", "<b>" + ghs(738) + "</b>", "Due 11 Feb", "—", btn("Statement", "s")],
      ["☑", "Fiifi Annan", "P1 A", "+233 55 902 5531", "<b>" + ghs(690) + "</b>", "28 days", "01 Feb", btn("Statement", "s")], ["☐", "Adwoa Darko", "P2 A", "+233 24 000 4412", "<b>" + ghs(300) + "</b>", "Due 11 Feb", "—", btn("Statement", "s")]], { cls: ["", "", "", "", "r", "r", "", "r"] })}</div>
    <div class="mt">${card("Reminder preview · 23 recipients · 23 SMS credits", `<div class="inp area">Dear Mr. Owusu, Kofi's school fees balance is GH₵1,200.00 for Term 2. Pay by MoMo at pay.schoolos.app/bfa or at the bursary. – Bright Future Academy</div>`)}</div>` }),
  notes: [`${n(1)}Selecting rows → preview exact message, recipient count and credit cost before sending.`, `${n(2)}Guardian flagged "fee payer" is messaged; if none, primary contact.`],
  reqs: ["FR-FEE-13", "FR-MSG-03"],
});

add({
  id: "W33", slug: "collections-dashboard", group: "6 · Fees & payments", title: "Collections dashboard", route: "/fees/collections", roles: "Admin, Bursar, Head",
  html: shell({ role: "bursar", active: "Collections", title: "Collections — Term 2", crumb: "Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Export", ""),
    content: `<div class="grid c4">${stat("Expected", ghs(247200))}${stat("Collected", ghs(168400), "68%", "good")}${stat("Outstanding", ghs(78800), "32%", "bad")}${stat("Online share", "62%", "MoMo + card")}</div>
    <div class="grid c2 mt">${card("Collected per week", `<div class="row" style="align-items:flex-end;height:150px;gap:10px">${[38, 52, 41, 28, 9].map((v, i) => `<div style="flex:1;text-align:center"><div style="height:${v * 2.4}px;background:var(--brand);border-radius:5px 5px 0 0"></div><div class="small muted">Wk ${i + 1}</div></div>`).join("")}</div>`)}
    ${card("By level", [["Nursery/KG", 78], ["Primary 1–3", 71], ["Primary 4–6", 64], ["JHS", 61]].map(([l, p]) => `<div class="row" style="margin:9px 0"><span style="width:100px">${l}</span><div class="sp">${bar(p, p < 62 ? "warn" : "")}</div><b>${p}%</b></div>`).join(""))}</div>
    <div class="mt">${card("Top outstanding", table(["Pupil", "Class", "Owes"], [["Kofi Owusu", "P4 A", ghs(1200)], ["Fiifi Annan", "P1 A", ghs(690)], ["Yaw Asante", "JHS 1 B", ghs(640)]], { cls: ["", "", "r"] }))}</div>` }),
  notes: [`${n(1)}Expected = invoiced; Collected = successful, non-reversed payments; reversals reduce collected automatically.`, `${n(2)}Reconciles to the pesewa with the debtors report and ledger.`],
  reqs: ["FR-FEE-14"],
});

add({
  id: "W34", slug: "daily-cashup", group: "6 · Fees & payments", title: "Daily cash-up", route: "/fees/cashup", roles: "Bursar, Admin",
  html: shell({ role: "bursar", active: "Daily cash-up", title: "Cash-up — Tue 9 Feb 2027", crumb: "Fees", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Close day", "p"),
    content: `<div class="grid g21">${table(["Method", "Payments", "System total", "Counted", "Variance"], [
      ["Cash", 5, ghs(2300), `<div class="inp" style="justify-content:flex-end;min-height:30px">2,300.00</div>`, badge("0.00", "good")], ["Mobile money", 7, ghs(4350), `<span class="muted">auto-verified</span>`, "—"], ["Bank deposit", 2, ghs(1200), `<div class="inp" style="justify-content:flex-end;min-height:30px">1,200.00</div>`, badge("0.00", "good")]], { cls: ["", "r", "r", "r", "r"] })}
    ${card("Day summary", `<div class="row"><span class="sp">Total collected</span><b>${ghs(7850)}</b></div><div class="row"><span class="sp">Receipts</span><b>R-2027-0860 → 0873</b></div><div class="row"><span class="sp">Reversals</span><b>0</b></div><div class="hr"></div>${field("Note", "", { area: true, ph: "Optional" })}`)}</div>` }),
  notes: [`${n(1)}Counting cash against the system total each day catches errors while they're small; closed days become read-only.`],
  reqs: ["FR-FEE-15"],
});

// ───────── Messaging ─────────
add({
  id: "W35", slug: "messages-compose", group: "7 · Communication", title: "Compose message (bulk SMS)", route: "/messages/new", roles: "Admin, Head, Bursar, Registrar",
  html: shell({ active: "Messages", title: "New message", crumb: "Communicate", actions: btn("Save as template", ""),
    content: `<div class="grid g21"><div>${card("Audience", `${chips(["Whole school", "Level", "Class", "Debtors", "Selected pupils"], 2)}<div class="mt2">${field("Class(es)", "Primary 4 A, Primary 4 B", { sel: true })}</div><div class="small muted">Sends to the primary contact / SMS-enabled guardians. Duplicate numbers are sent once.</div>`)}
    <div class="mt">${card("Message", field("Template", "General notice", { sel: true }) + `<div class="inp area" style="min-height:110px">Dear {guardian}, Primary 4 will have an excursion to Manhyia Palace on Fri 19 Feb. Please send GH₵30 by Wed. – Bright Future Academy</div><div class="row small muted mt2"><span>182 characters · 2 SMS segments</span><span class="sp"></span><span>Placeholders: {guardian} {student} {class} {balance}</span></div>`)}</div></div>
    ${card("Review & send", `<div class="stat"><div class="l">Recipients</div><div class="v">64</div></div><div class="hr"></div><div class="row"><span class="sp">Credits needed</span><b>128</b></div><div class="row"><span class="sp">Credits available</span><b>1,180</b></div><div class="row"><span class="sp">After sending</span><b>1,052</b></div><div class="mt">${btn("Send now", "p w")}</div><div class="mt2">${btn("Schedule…", "w")}</div>`)}</div>` }),
  notes: [`${n(1)}Cost is shown before sending (recipients × segments); below zero credits the send is blocked with a top-up link.`, `${n(2)}Placeholders personalise each SMS; preview renders the first recipient.`],
  reqs: ["FR-MSG-02", "FR-MSG-03", "FR-MSG-04"],
});

add({
  id: "W36", slug: "messages-log-credits", group: "7 · Communication", title: "Message history & SMS credits", route: "/messages", roles: "Admin, Head, Bursar",
  html: shell({ active: "Messages", title: "Messages", crumb: "Communicate", actions: btn("Top up credits", "") + btn("+ New message", "p"),
    content: `${tabs(["History", "Templates", "Credits", "Announcements"], 0)}<div class="grid c4">${stat("SMS credits", "1,180", "≈ 12 days at current use", "warn")}${stat("Sent today", "86")}${stat("Delivered", "97%")}${stat("Failed", "3", "bad numbers", "bad")}</div>
    <div class="mt">${table(["Time", "Type", "To", "Message", "Status"], [
      ["08:12", badge("Absence", "bad"), "Mr. J. Owusu", "Kofi was marked absent on Tue 9 Feb…", badge("Delivered", "good")], ["08:12", badge("Absence", "bad"), "Mrs. R. Osei", "Abena was marked absent on Tue 9 Feb…", badge("Delivered", "good")],
      ["09:30", badge("Receipt"), "Mr. J. Owusu", "Receipt R-2027-0874: GH₵700 received…", badge("Sent", "info")], ["09:31", badge("Fee reminder", "warn"), "+233 24 555 01", "Dear parent, fee balance GH₵…", badge("Failed · invalid number", "bad")]])}</div>` }),
  notes: [`${n(1)}Every automated message (absence, receipt, reminder, report ready) lands here with delivery status — the answer to "did the parent get it?".`, `${n(2)}Failed numbers link back to the guardian record to fix.`],
  reqs: ["FR-MSG-01", "FR-MSG-02", "FR-MSG-04"],
});

// ───────── Admin ─────────
add({
  id: "W37", slug: "users-roles", group: "8 · Administration", title: "Users & roles", route: "/settings/users", roles: "Admin",
  html: shell({ active: "Users & roles", title: "Users & roles", crumb: "School", actions: btn("+ Invite user", "p"),
    content: `<div class="grid g21">${table(["User", "Role(s)", "Last login", "Status", ""], [
      ["<b>Ama Boateng</b><br><span class='small muted'>ama@brightfuture.edu.gh</span>", badge("School admin", "brand"), "Today 07:30", badge("Active", "good"), btn("Edit", "s")],
      ["<b>Grace Tetteh</b>", badge("Headteacher", "good"), "Today 07:10", badge("Active", "good"), btn("Edit", "s")], ["<b>Kojo Mensima</b>", badge("Bursar", "info"), "Today 08:02", badge("Active", "good"), btn("Edit", "s")],
      ["<b>Mr. Ofori Mensah</b>", badge("Teacher") + " " + badge("Class teacher JHS 1 A", "brand"), "Yesterday", badge("Active", "good"), btn("Edit", "s")], ["<b>Mr. Yeboah</b>", badge("Teacher"), "—", badge("Invited", "warn"), btn("Resend", "s")]])}
    ${card("What each role can do", `<table style="font-size:12px"><tr><th></th><th class="c">Adm</th><th class="c">Head</th><th class="c">Tch</th><th class="c">Bur</th></tr>${[["Take attendance", "✓", "—", "own", "—"], ["Enter scores", "✓", "—", "own", "—"], ["Approve reports", "✓", "✓", "—", "—"], ["Record payments", "✓", "—", "—", "✓"], ["Reverse payments", "✓", "—", "—", "—"], ["Fee structure", "✓", "—", "—", "✓"], ["Audit log", "✓", "✓", "—", "—"]].map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((c) => `<td class="c">${c}</td>`).join("")}</tr>`).join("")}</table>`)}</div>` }),
  notes: [`${n(1)}Roles map 1:1 to the matrix in src/lib/permissions.ts; teachers are also scoped to the classes/subjects they're assigned.`, `${n(2)}Invites go by email or SMS; staff set their own password.`],
  reqs: ["FR-AUTH-03", "FR-AUTH-01"],
});

add({
  id: "W38", slug: "school-settings", group: "8 · Administration", title: "School settings & policies", route: "/settings", roles: "Admin",
  html: shell({ active: "Settings", title: "Settings", crumb: "School", actions: btn("Save", "p"),
    content: `${tabs(["School profile", "Policies", "Numbering", "SMS", "Report card"], 1)}<div class="grid c2">${card("Fees policy", `<label class="small"><input type="checkbox" checked> Hide report cards when balance exceeds</label><div class="mt2">${field("Threshold (GH₵)", "200.00")}</div><label class="small"><input type="checkbox" checked> Auto-apply sibling discount (10% tuition)</label><div class="hr"></div>${field("Invoice due after (days)", "30", {})}${field("Late fee", "None", { sel: true })}`)}
    ${card("Attendance & scores", `${field("School days", "Mon – Fri", { sel: true })}<label class="small"><input type="checkbox" checked> SMS guardians when child is marked absent</label><br><label class="small"><input type="checkbox"> Also SMS for late arrival</label><div class="hr"></div><label class="small"><input type="checkbox" checked> Lock scores after head approves</label><br><label class="small"><input type="checkbox"> Rank Nursery/KG pupils</label><div class="hr"></div>${field("Pass mark (for repeat suggestion)", "40")}`)}</div>` }),
  notes: [`${n(1)}All behavioural switches live here so the same product fits schools with different habits (withhold reports or not, rank KG or not).`, `${n(2)}Every change is audit-logged.`],
  reqs: ["FR-SET-07", "FR-RPT-12", "FR-ATT-06"],
});

add({
  id: "W39", slug: "audit-log", group: "8 · Administration", title: "Audit log", route: "/audit", roles: "Admin, Head",
  html: shell({ active: "Audit log", title: "Audit log", crumb: "School", actions: btn("Export", ""),
    content: `${filters(["Action: All", "User: All", "Entity: All", "Last 7 days"])}${table(["When", "Who", "Action", "Entity", "Change"], [
      ["09 Feb 09:41", "Ama Boateng", badge("payment.reverse", "bad"), "R-2027-0861", "GH₵ 300 → reversed · “Bounced cheque”"], ["09 Feb 09:12", "Kojo Mensima", badge("payment.create"), "R-2027-0874", "GH₵ 700 · MoMo"],
      ["08 Feb 16:40", "Mr. Ofori", badge("score.update", "warn"), "Maths · Kofi Owusu", "Exam 41 → 47"], ["08 Feb 15:02", "Grace Tetteh", badge("report.publish", "info"), "JHS 1 A (28 cards)", "Published"],
      ["08 Feb 11:20", "Ama Boateng", badge("grading.update", "warn"), "JHS scale", "Grade 6 from 45 → 46"]])}` }),
  notes: [`${n(1)}Immutable: who, when, before → after for payments, score edits after submission, grade changes, publishing and status changes.`],
  reqs: ["FR-AUD-01"],
});
