import { shell, phone, card, stat, table, badge, btn, av, bar, field, tabs, chips, seg, n, ghs } from "./lib.mjs";

export const pages = [];
const add = (p) => pages.push(p);
const PNAV = ["Home", "Attendance", "Results", "Fees"];
const strip = (s) => s.split("").map((c) => `<span class="sq ${c}" style="width:18px;height:18px"></span>`).join(" ");

// ───────── Teacher mobile ─────────
add({
  id: "W40", slug: "teacher-home-mobile", group: "9 · Teacher & parent (mobile)", title: "Teacher home (phone)", route: "/", roles: "Teacher", width: 430, kind: "phone",
  html: phone({ title: "Good morning, Mr. Sarpong", sub: "Primary 4 A class teacher", nav: ["Home", "Attendance", "Scores", "Remarks"], onNav: 0, body: `
   ${card("Today · Tue 9 Feb", `<div class="row"><div class="sp"><b>Primary 4 A</b><br><span class="small muted">Register not taken yet</span></div>${btn("Take attendance", "p")}</div>`)}
   ${card("My subjects · score entry", [["Mathematics · P4 A", 100], ["Mathematics · P4 B", 74], ["Science · P5 A", 31]].map(([t, p]) => `<div class="row-s"><div class="sp"><b>${t}</b>${bar(p, p < 50 ? "warn" : "good")}</div><b>${p}%</b></div>`).join("") + `<div class="small muted">Deadline 20 Mar · 6 days left</div>`)}
   ${card("Class teacher to-do", `<div class="row-s"><span class="sp">Write remarks</span>${badge("12 of 34 done", "warn")}</div><div class="row-s"><span class="sp">Pupils absent 3+ days</span>${badge("2", "bad")}</div>`)}` }),
  notes: [`${n(1)}Teacher's whole job in three cards: register, scores, remarks. Everything else is hidden.`, `${n(2)}Deadline countdown comes from the term's report schedule.`],
  reqs: ["FR-ATT-01", "FR-RPT-03", "FR-RPT-07"],
});

// ───────── Parent mobile ─────────
add({
  id: "W41", slug: "parent-home", group: "9 · Teacher & parent (mobile)", title: "Parent home — my children", route: "/", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Hello, Mr. Mensah", sub: "Bright Future Academy · Term 2", nav: PNAV, onNav: 0, time: "18:12", body: `
   <div class="card" style="background:var(--bad-s);border-color:#fecaca"><b style="color:var(--bad)">Kwame was marked absent on Mon 8 Feb</b><div class="small">Reply to the school if this is a mistake.</div></div>
   ${[["Kwame Mensah", "Primary 4 A", "96%", ghs(0), true], ["Akosua Mensah", "KG 2", "91%", ghs(738), false]].map(([nm, c, a, b, ok]) => `<div class="card"><div class="row">${av(nm)}<div class="sp"><b>${nm}</b><br><span class="small muted">${c}</span></div><span class="small muted">›</span></div><div class="grid c2 mt2"><div><div class="small muted">Attendance</div><b>${a}</b></div><div><div class="small muted">Fee balance</div><b style="color:var(--${ok ? "good" : "bad"})">${b}</b></div></div>${ok ? "" : `<div class="mt2">${btn("Pay now", "p w")}</div>`}</div>`).join("")}
   ${card("Announcements", `<div class="row-s"><span class="sp"><b>PTA meeting</b><br><span class="small muted">Sat 13 Feb · 10:00</span></span></div><div class="row-s"><span class="sp"><b>Term 2 report cards</b><br><span class="small muted">Available 26 Mar</span></span></div>`)}` }),
  notes: [`${n(1)}One phone login shows every child at this school, siblings included; alerts first.`, `${n(2)}"Pay now" only appears when a balance exists.`],
  reqs: ["FR-PAR-01", "FR-PAR-02", "FR-PAR-03"],
});

add({
  id: "W42", slug: "parent-child-attendance", group: "9 · Teacher & parent (mobile)", title: "Child — attendance", route: "/children/[id]/attendance", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Kwame Mensah", sub: "Primary 4 A", nav: PNAV, onNav: 1, time: "18:13", body: `
   ${seg(["Attendance", "Results", "Fees"], 0)}
   <div class="grid c3"><div class="card c"><div class="small muted">Present</div><b style="font-size:20px">47</b></div><div class="card c"><div class="small muted">Absent</div><b style="font-size:20px;color:var(--bad)">2</b></div><div class="card c"><div class="small muted">Late</div><b style="font-size:20px">1</b></div></div>
   ${card("Term 2 · 96%", `<div class="small muted">Weeks 1–5 (Mon–Fri)</div>${["PPPPP", "PPLPP", "PPPPP", "PAPPP", "PA"].map((w) => `<div class="mt2">${strip(w)}</div>`).join("")}<div class="row small mt2"><span class="sq P"></span>Present <span class="sq A"></span>Absent <span class="sq L"></span>Late</div>`)}
   ${card("Absences", `<div class="row-s"><span class="sp">Mon 8 Feb</span>${badge("Unexplained", "bad")}</div><div class="row-s"><span class="sp">Wed 3 Feb</span>${badge("Excused · sick", "info")}</div>`)}` }),
  notes: [`${n(1)}Labels and colours together; read-only. Parents can't edit attendance, only message the school.`],
  reqs: ["FR-PAR-02"],
});

add({
  id: "W43", slug: "parent-report-card", group: "9 · Teacher & parent (mobile)", title: "Child — report card", route: "/children/[id]/results", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Kwame Mensah", sub: "Report card · Term 2, 2026/2027", nav: PNAV, onNav: 2, time: "18:15", body: `
   <div class="card"><div class="row"><div class="sp"><div class="small muted">Position</div><b style="font-size:24px">3rd</b><span class="muted"> of 38</span></div><div class="sp"><div class="small muted">Average</div><b style="font-size:24px">76.0</b></div><div class="sp"><div class="small muted">Attendance</div><b style="font-size:24px">96%</b></div></div></div>
   ${card("Subjects", [["Mathematics", "77.5", "2"], ["English Language", "79.0", "2"], ["Integrated Science", "75.5", "2"], ["Social Studies", "74.0", "2"], ["ICT", "80.0", "1"], ["French", "70.0", "2"], ["RME", "76.0", "2"]].map(([s, t, g]) => `<div class="row-s"><span class="sp">${s}</span><b>${t}</b>${badge("Grade " + g, g === "1" ? "good" : "brand")}</div>`).join(""))}
   ${card("Remarks", `<div class="small"><b>Class teacher:</b> A pleasant pupil who must read more.<br><b>Head:</b> Good effort. Keep it up.</div>`)}
   ${btn("Download PDF report card", "p l")}` }),
  notes: [`${n(1)}Same data as the printed card, rearranged for a phone; PDF is identical to the A4 print version (W23).`, `${n(2)}If the school withholds cards for unpaid fees, this screen shows a polite notice and the Pay now button instead (state W43b).`],
  reqs: ["FR-RPT-11", "FR-RPT-12", "FR-PAR-02"],
});

add({
  id: "W43b", slug: "parent-report-withheld", group: "9 · Teacher & parent (mobile)", title: "Report card withheld (fees policy)", route: "/children/[id]/results", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Akosua Mensah", sub: "Report card · Term 2, 2026/2027", nav: PNAV, onNav: 2, time: "18:16", body: `
   <div class="card c" style="padding:22px"><div style="font-size:34px">🔒</div><b>Report card is ready</b><div class="small muted mt2">The school requires the outstanding balance of <b>${ghs(738)}</b> to be cleared before this report is released.</div><div class="mt">${btn("Pay " + ghs(738), "p l")}</div><div class="small muted mt2">Paid already or arranged with the school? Contact the bursar: 024 902 5531</div></div>` }),
  notes: [`${n(1)}Tone is neutral and helpful — never shaming; balance is re-checked every time the parent opens the page, so paying unlocks instantly.`, `${n(2)}Only shown if the school switches the policy on; staff can override per pupil.`],
  reqs: ["FR-RPT-12"],
});

add({
  id: "W44", slug: "parent-fees", group: "9 · Teacher & parent (mobile)", title: "Child — fees & Pay now", route: "/children/[id]/fees", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Akosua Mensah", sub: "Fees · Term 2", nav: PNAV, onNav: 3, time: "18:17", body: `
   <div class="card c"><div class="small muted">Balance due</div><div style="font-size:32px;font-weight:800;color:var(--bad)">${ghs(738)}</div><div class="small muted">Due 11 Feb 2027</div></div>
   ${card("Invoice INV-2027-0433", `<table style="font-size:12.5px">${[["Tuition", 480], ["PTA", 40], ["Feeding", 220], ["Books", 80]].map(([a, b]) => `<tr><td>${a}</td><td class="r">${ghs(b)}</td></tr>`).join("")}<tr><td class="small" style="color:var(--good)">Sibling discount</td><td class="r small" style="color:var(--good)">−${ghs(82)}</td></tr><tr><td class="b">Total</td><td class="r b">${ghs(738)}</td></tr></table>`)}
   ${card("Pay", field("Amount", "738.00") + field("Method", "Mobile money", { sel: true }) + field("MoMo number", "024 555 0147") + btn("Pay " + ghs(738), "p l") + `<div class="hint c mt2">Part payments allowed · Secured by Paystack</div>`)}
   ${card("Payment history", `<div class="row-s"><span class="sp">20 Jan · MoMo</span><span class="muted small">no payments for this term</span></div>`)}` }),
  notes: [`${n(1)}Amount is editable (part payment) but defaults to the full balance.`, `${n(2)}Same ledger the bursar sees, read-only.`],
  reqs: ["FR-FEE-09", "FR-PAR-02"],
});

add({
  id: "W45", slug: "parent-pay-pending", group: "9 · Teacher & parent (mobile)", title: "MoMo approval prompt", route: "/pay/[ref]", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Confirm payment", sub: "Akosua Mensah · Term 2", time: "18:18", body: `
   <div class="card c" style="padding:24px"><div style="font-size:40px;font-weight:800">${ghs(738)}</div><div class="small muted mt2">MTN MoMo · 024 555 0147</div><div class="hr"></div><b>Check your phone</b><div class="small muted mt2">Approve the prompt on your phone and enter your MoMo PIN. This page updates automatically.</div><div class="mt"><div class="bar"><i style="width:55%"></i></div><div class="small muted mt2">Waiting for confirmation… 0:34</div></div></div>
   <div class="small muted c">No prompt? Dial *170# → My Approvals.<br>Do not pay twice — we will confirm by SMS.</div>${btn("Cancel", "l")}` }),
  notes: [`${n(1)}Pending state polls the payment status; the webhook (idempotent on provider reference) is the source of truth, not the browser.`, `${n(2)}Timeouts end in "Failed — you were not charged" with a retry.`],
  reqs: ["FR-FEE-09"],
});

add({
  id: "W46", slug: "parent-pay-success", group: "9 · Teacher & parent (mobile)", title: "Payment successful + receipt", route: "/pay/[ref]", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Payment received", sub: "Thank you", time: "18:19", body: `
   <div class="card c" style="padding:24px"><div style="font-size:40px;color:var(--good)">✓</div><div style="font-size:30px;font-weight:800">${ghs(738)}</div><div class="small muted">Receipt R-2027-0875</div><div class="hr"></div><div class="row small"><span class="sp">Pupil</span><b>Akosua Mensah</b></div><div class="row small"><span class="sp">Balance now</span><b style="color:var(--good)">${ghs(0)}</b></div></div>
   ${btn("Download receipt (PDF)", "p l")}${btn("Back to home", "l")}
   <div class="small muted c">A receipt was also sent by SMS to 024 555 0147.</div>` }),
  notes: [`${n(1)}Receipt number is issued by the same sequence as counter payments — the bursar sees it instantly in today's list and the school's collections update.`],
  reqs: ["FR-FEE-08", "FR-FEE-09"],
});

// ───────── Blueprint diagrams ─────────
const box = (t, items, c = "") => `<div class="card" style="${c}"><div class="h">${t}</div>${items.map((i) => `<div class="small" style="padding:2px 0">${i}</div>`).join("")}</div>`;
const arrow = `<div style="display:grid;place-items:center;font-size:22px;color:var(--brand)">➜</div>`;

add({
  id: "D01", slug: "sitemap", group: "Blueprint diagrams", title: "Sitemap — every screen by role", route: "—", roles: "all", width: 1400,
  html: `<div style="padding:24px"><h1 style="margin-bottom:4px">SchoolOS sitemap</h1><div class="muted" style="margin-bottom:16px">Screen IDs match the wireframe images (W##). 49 screens + 4 diagrams.</div>
  <div class="grid c3">
  ${box("Platform & access", ["W01 Sign in (staff / parent)", "W01b Parent OTP", "W02 Platform: schools, plans, billing"])}
  ${box("Admin / Head", ["W03 Dashboard", "W04 Calendar & terms", "W05 Levels & classes", "W06 Subjects & teachers", "W07 Students · W08 Profile · W09 Add · W10 Import", "W11 Admissions · W12 Staff · W13 Promotion", "W15 Attendance today · W16 Class report · W17 Student attendance", "W18 Grading setup · W20 Completion · W21 Broadsheet", "W22 Remarks & approval · W23/W24 Report card · W25 Publish", "W35 Compose · W36 Message log", "W37 Users & roles · W38 Settings · W39 Audit"])}
  ${box("Bursar", ["W03b Fees dashboard", "W26 Fee structure", "W27 Generate invoices · W28 Invoices", "W29 Record payment · W30 Receipt", "W31 Student statement · W32 Debtors", "W33 Collections · W34 Daily cash-up"])}
  ${box("Teacher (phone-first)", ["W40 Teacher home", "W14 Take attendance", "W19 Score entry grid", "W22 Remarks (own class)", "W07 Students (own classes)"])}
  ${box("Registrar", ["W07/W08/W09/W10 Students", "W11 Admissions pipeline", "W13 Promotion (with admin)"])}
  ${box("Parent (phone-first)", ["W41 Home — my children", "W42 Attendance", "W43 Report card · W43b Withheld", "W44 Fees & Pay now", "W45 MoMo prompt · W46 Success"])}</div></div>`,
  notes: [`${n(1)}Same app, role-based navigation: each role sees only its menu (nav sets in design/lib.mjs mirror the permission matrix).`, `${n(2)}Teachers and parents are phone-first; admin, bursar and head are desktop-first but responsive.`],
  reqs: [],
});

add({
  id: "D02", slug: "term-lifecycle", group: "Blueprint diagrams", title: "A term, end to end", route: "—", roles: "all", width: 1500,
  html: `<div style="padding:24px"><h1 style="margin-bottom:14px">How one term flows through the system</h1>
  <div style="display:grid;grid-template-columns:repeat(9,1fr) ;gap:6px;align-items:stretch">
   ${[["1 Set up", "Term dates, holidays, classes, subjects, fee structure", "Admin"], ["2 Enrol", "Import/add students, link guardians, place in classes", "Registrar"], ["3 Invoice", "Generate invoices (+ arrears, discounts), issue", "Bursar"], ["4 Daily", "Attendance → absent SMS · payments → receipts → SMS", "Teacher / Bursar"], ["5 Mid-term", "Reminders to debtors, chronic-absence follow-up", "Head / Bursar"], ["6 Assess", "Score entry per subject, completion tracker", "Teachers / Head"], ["7 Remarks", "Conduct + remarks, positions computed", "Class teacher"], ["8 Approve & publish", "Head approves → scores lock → publish + SMS (fees policy applied)", "Head"], ["9 Year-end", "Term 3: promotion wizard, next-year enrolments", "Admin"]].map(([t, d, r]) => `<div class="card" style="padding:10px"><div class="b" style="color:var(--brand-d)">${t}</div><div class="small" style="margin:6px 0">${d}</div><div class="badge brand">${r}</div></div>`).join("")}</div>
  <div class="grid c3 mt">${card("Attendance loop (daily)", `<div class="small">Teacher marks register ➜ submit ➜ absent guardians get SMS ➜ head sees missing registers ➜ term totals feed report-card “present out of opened”.</div>`)}${card("Fees loop (continuous)", `<div class="small">Invoice ➜ payment (counter or MoMo) ➜ allocation (oldest first) ➜ receipt + SMS ➜ balance ➜ debtors list ➜ reminder SMS ➜ optional report-card hold.</div>`)}${card("Results loop (term)", `<div class="small">Scores ➜ weighted total ➜ grade ➜ subject position ➜ overall position ➜ remarks ➜ approve ➜ publish ➜ parent views / PDF.</div>`)}</div></div>`,
  notes: [`${n(1)}The three loops (attendance, fees, results) meet on the report card: attendance totals and the fee policy both feed it.`], reqs: [],
});

add({
  id: "D03", slug: "data-model", group: "Blueprint diagrams", title: "Data model overview", route: "—", roles: "dev", width: 1500,
  html: `<div style="padding:24px"><h1 style="margin-bottom:4px">Data model (prisma/schema.prisma)</h1><div class="muted" style="margin-bottom:14px">43 tables, every tenant table scoped by <code>schoolId</code>. Arrows read “has many”.</div>
  <div class="grid c4">
  ${box("Platform", ["<b>Plan</b> → Subscription → PlatformInvoice", "<b>School</b> (tenant root)", "<b>User</b> ⟷ <b>Membership</b> (role per school)", "AuditLog · DocumentSequence"])}
  ${box("Academic structure", ["AcademicYear → <b>Term</b>", "CalendarDay (holidays)", "<b>Level</b> → <b>Class</b>", "Subject ⟷ Class = <b>ClassSubject</b> (teacher, year)"])}
  ${box("People", ["<b>Student</b> ⟷ <b>Guardian</b> (StudentGuardian)", "Staff (class teacher / subject teacher)", "<b>Enrollment</b> = Student × Class × Year", "AdmissionApplication → Student · StudentDocument"])}
  ${box("Attendance", ["<b>AttendanceRecord</b> (student, date, status) unique per day", "AttendanceSubmission (class, date) — register taken?", "→ term totals computed, not stored"])}
  ${box("Assessment & reports", ["GradingScale → GradeBand", "AssessmentScheme (per level) → SchemeComponent", "<b>Score</b> (student, term, classSubject, component)", "SubjectResult (cached total, grade, position)", "<b>TermReport</b> (position, remarks, status)"])}
  ${box("Fees & payments", ["FeeItem → <b>FeeStructureLine</b> (term × level)", "Discount → StudentDiscount", "<b>Invoice</b> → InvoiceLine", "<b>Payment</b> → <b>PaymentAllocation</b> → Invoice", "(unallocated remainder = credit)"])}
  ${box("Communication", ["MessageTemplate", "<b>Message</b> (status, segments)", "SmsCreditEntry (ledger)", "Announcement"])}
  ${box("Rules baked into the schema", ["unique(student, date) → no double attendance", "unique(student, term, classSubject, component) → one score", "unique(school, receiptNo / invoiceNo / admissionNo)", "Decimal(12,2) money · append-only payments (reverse, never delete)"], "background:#f0fdfa")}</div></div>`,
  notes: [`${n(1)}Enrollment (not Student.classId) keeps history so promotion never rewrites the past.`, `${n(2)}Payments allocate to invoices through PaymentAllocation — one payment can clear several terms.`], reqs: [],
});

add({
  id: "D04", slug: "architecture", group: "Blueprint diagrams", title: "System architecture", route: "—", roles: "dev", width: 1400,
  html: `<div style="padding:24px"><h1 style="margin-bottom:14px">Architecture</h1>
  <div style="display:grid;grid-template-columns:1fr 40px 1.3fr 40px 1fr;gap:6px;align-items:stretch">
   <div class="grid" style="gap:10px">${box("Clients", ["Staff web app (desktop-first)", "Teacher & parent PWA (phone-first, offline drafts)", "Print / PDF (report cards, receipts)"])}${box("Public", ["School subdomain login", "Online application form"])}</div>${arrow}
   <div class="grid" style="gap:10px">${box("Next.js app (single codebase)", ["Role-aware routes /(staff) /(parent) /(platform)", "Server actions & route handlers", "Auth: staff password · parent phone OTP", "Tenant guard: forSchool(schoolId) + RLS"], "border-color:var(--brand)")}${box("Domain services (src/lib)", ["attendance · grading/ranking · fees allocation", "receipts & sequences · permissions (RBAC)", "messaging (templates, credits)"])}${box("Background jobs", ["Absence & reminder SMS queue", "Batch report-card PDFs", "Payment webhook reconcile", "Nightly backups, invoice reminders"])}</div>${arrow}
   <div class="grid" style="gap:10px">${box("Data", ["PostgreSQL (all tenants, RLS)", "Object storage (photos, documents, PDFs)", "Redis/queue (jobs, rate limits)"])}${box("Integrations", ["Paystack / Hubtel (MoMo + card)", "Arkesel / Hubtel (SMS)", "Email (invites, receipts)", "Error tracking & logs (no PII)"])}</div></div></div>`,
  notes: [`${n(1)}Start as one Next.js + Postgres deployment; split jobs/workers only when SMS or PDF volume demands it.`, `${n(2)}Webhooks (payments, SMS delivery) are the source of truth; the browser only displays state.`], reqs: [],
});
