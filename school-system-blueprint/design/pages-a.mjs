import { shell, phone, card, stat, table, badge, btn, av, bar, field, tabs, chips, seg, filters, n, KIDS, ghs } from "./lib.mjs";

export const pages = [];
const add = (p) => pages.push(p);

// ───────── 01 Login ─────────
add({
  id: "W01", slug: "login", group: "0 · Platform & access", title: "Sign in (staff / parent)", route: "/login", roles: "everyone", width: 1100,
  html: `<div style="display:grid;grid-template-columns:1fr 1fr;min-height:620px">
  <div style="background:var(--nav);color:#fff;padding:60px 56px"><div class="logo"><span>S</span>SchoolOS</div>
   <h1 style="font-size:32px;margin:90px 0 12px;line-height:1.2">Attendance, report cards and fees — in one place.</h1><p style="color:#94a3b8;max-width:380px">Built for Nursery to JHS schools in Ghana. Parents get SMS alerts and pay fees with mobile money.</p></div>
  <div style="display:grid;place-items:center;background:#fff"><div style="width:380px">
   <div class="small muted">Bright Future Academy · brightfuture.schoolos.app</div><h2 style="font-size:24px;margin:4px 0 16px">Welcome back</h2>
   ${seg(["Staff", "Parent / guardian"], 0)}
   <div style="margin-top:16px">${field("Email", "ama@brightfuture.edu.gh")}${field("Password", "••••••••••")}</div>
   <div class="row"><span class="small muted">☐ Keep me signed in</span><span class="sp"></span><span class="small" style="color:var(--brand)">Forgot password?</span></div>
   <div class="mt">${btn("Sign in", "p l w")}</div>
   <div class="hr"></div><div class="small muted">Parent? Switch tab → enter your phone number → we send a 6-digit code by SMS.</div></div></div></div>`,
  notes: [`${n(1)}Tab switches between staff (email+password) and parent (phone + OTP) — same URL per school subdomain.`, `${n(2)}School branding (logo, name) comes from the subdomain, so parents instantly recognise the right school.`, `${n(3)}Lockout after repeated failures; OTP rate-limited per phone.`],
  reqs: ["FR-AUTH-01", "FR-AUTH-02", "FR-PLT-06"],
});

add({
  id: "W01b", slug: "parent-otp", group: "0 · Platform & access", title: "Parent sign-in with SMS code", route: "/login (parent tab)", roles: "Parent", width: 430, kind: "phone",
  html: phone({ title: "Bright Future Academy", sub: "Parent portal", time: "18:05", body: `
   <div class="card"><div class="b">Enter your phone number</div><div class="small muted mt2">We will send a 6-digit code by SMS.</div>
   <div class="mt">${field("Phone", "+233 24 555 0147")}</div>${btn("Send code", "p l")}</div>
   <div class="card"><div class="b">Enter code</div><div class="row mt2">${"<div class='inp c' style='width:44px;justify-content:center;font-size:20px;font-weight:700'>4</div>".repeat(3)}${"<div class='inp c' style='width:44px;justify-content:center;font-size:20px'>·</div>".repeat(3)}</div>
   <div class="small muted mt2">Resend in 0:42</div></div>
   <div class="small muted c">No password to remember. One login shows all your children at this school.</div>` }),
  notes: [`${n(1)}Phone number is the identity; one guardian record can be linked to many children.`, `${n(2)}Code expires in 5 minutes, resend after 60 s.`],
  reqs: ["FR-AUTH-02", "FR-PAR-01"],
});

// ───────── 02 Platform schools ─────────
add({
  id: "W02", slug: "platform-schools", group: "0 · Platform & access", title: "Platform admin — schools", route: "/platform/schools", roles: "Platform admin",
  html: shell({ role: "platform", active: "Schools", title: "Schools", crumb: "Platform", who: "Wodona Support", whoRole: "Platform admin", actions: btn("Export", "") + btn("+ Onboard school", "p"),
    content: `<div class="grid c4">${stat("Active schools", "38", "+4 this term")}${stat("Students billed", "11,420", "Term 2")}${stat("Revenue this term", ghs(57100), "Plan: GH₵5 / student")}${stat("Trials ending ≤ 7 days", "3", "Follow up", "warn")}</div>
    <div class="mt">${filters(["Status: All", "Plan: All", "Region: Ashanti", `<div class="inp" style="min-width:240px">Search school…</div>`])}
    ${table(["School", "Town", "Plan", "Students", "SMS credits", "Subscription", "Last active", ""], [
      ["<b>Bright Future Academy</b><br><span class='small muted'>brightfuture</span>", "Kumasi", "Standard", "412", "1,180", badge("Active", "good"), "Today", btn("Open", "s")],
      ["<b>Grace Royal Prep</b><br><span class='small muted'>graceroyal</span>", "Kumasi", "Standard", "268", "95", badge("Active", "good"), "Today", btn("Open", "s")],
      ["<b>Little Stars Nursery</b><br><span class='small muted'>littlestars</span>", "Ejisu", "Starter", "74", "340", badge("Trial · 5 days", "warn"), "Yesterday", btn("Open", "s")],
      ["<b>Hopeville Basic</b><br><span class='small muted'>hopeville</span>", "Obuasi", "Standard", "331", "0", badge("Past due", "bad"), "3 days ago", btn("Open", "s")],
      ["<b>Unity International</b><br><span class='small muted'>unity</span>", "Accra", "Plus", "590", "2,400", badge("Active", "good"), "Today", btn("Open", "s")]], { cls: ["", "", "", "r", "r", "", "", "r"] })}</div>` }),
  notes: [`${n(1)}Onboard creates the tenant + emails/SMS an invite to the school admin.`, `${n(2)}Past-due → school goes read-only after grace period (published report cards stay viewable).`, `${n(3)}"Open" = audited support access, time-boxed and visible to the school.`],
  reqs: ["FR-PLT-02", "FR-PLT-03", "FR-PLT-04", "FR-PLT-05"],
});

// ───────── 03 Admin dashboard ─────────
add({
  id: "W03", slug: "admin-dashboard", group: "1 · Dashboards", title: "Admin / Head dashboard", route: "/", roles: "Admin, Headteacher",
  html: shell({ active: "Dashboard", title: "Good morning, Ama", crumb: "Tuesday 9 Feb 2027 · Term 2, week 5", actions: btn("Take attendance", "") + btn("Record payment", "p"),
    content: `<div class="grid c4">${stat("Present today", "92%", "379 of 412 pupils", "good")}${stat("Registers submitted", "13 / 16", "3 classes missing", "warn")}${stat("Fees collected (Term 2)", ghs(168400), "of " + ghs(247200) + " · 68%")}${stat("Report cards ready", "0 / 412", "Scores 61% entered")}</div>
    <div class="grid g21 mt">
     ${card("Needs attention", table(["", "Item", "Action"], [
       [badge("Attendance", "warn"), "Primary 3 B, Primary 5 A, JHS 1 A have not submitted today", btn("Remind teachers", "s")],
       [badge("Absence", "bad"), "7 pupils absent 3+ days in a row", btn("View list", "s")],
       [badge("Fees", "bad"), "46 invoices overdue · " + ghs(38950), btn("Debtors", "s")],
       [badge("SMS", "warn"), "SMS credits low: 1,180 left (≈ 2 days of alerts)", btn("Top up", "s")],
       [badge("Setup", "info"), "Subjects not assigned for JHS 2 B", btn("Fix", "s")]])) }
     ${card("Setup checklist", [["Academic year & terms", 1], ["Classes & teachers", 1], ["Subjects per class", 0], ["Grading scale & scheme", 1], ["Fee structure", 1], ["Students imported", 1]].map(([t, d]) => `<div class="row-s"><span class="badge ${d ? "good" : "warn"}">${d ? "✓" : "!"}</span><span>${t}</span></div>`).join(""))}</div>
    <div class="grid c2 mt">${card("Attendance this week", `<div class="row" style="align-items:flex-end;height:110px;gap:16px">${[94, 93, 95, 91, 92].map((h, i) => `<div style="flex:1;text-align:center"><div style="height:${h}px;background:var(--brand);border-radius:6px 6px 0 0;opacity:${i === 4 ? 1 : .55}"></div><div class="small muted">${["Mon", "Tue", "Wed", "Thu", "Fri"][i]} ${h}%</div></div>`).join("")}</div>`)}
    ${card("Fees by class (collected %)", ["JHS 3", "JHS 2", "JHS 1", "Primary 6", "Primary 5"].map((c, i) => `<div class="row" style="margin:6px 0"><span style="width:80px">${c}</span><div class="sp">${bar([82, 71, 64, 59, 48][i], [82, 71, 64, 59, 48][i] < 55 ? "bad" : "")}</div><b>${[82, 71, 64, 59, 48][i]}%</b></div>`).join(""))}</div>` }),
  notes: [`${n(1)}Four top tiles answer the head's morning questions: who came, who hasn't registered, money, report progress.`, `${n(2)}"Needs attention" is the action list — each row jumps to the exact filtered screen.`, `${n(3)}Setup checklist disappears once complete.`],
  reqs: ["FR-ATT-03", "FR-ATT-09", "FR-FEE-14", "FR-RPT-08", "FR-SET-06"],
});

add({
  id: "W03b", slug: "bursar-dashboard", group: "1 · Dashboards", title: "Bursar dashboard", route: "/", roles: "Bursar",
  html: shell({ role: "bursar", active: "Dashboard", title: "Fees desk", crumb: "Tuesday 9 Feb 2027", who: "Kojo Mensima", whoRole: "Bursar", actions: btn("Close today's cash-up", "") + btn("+ Record payment", "p"),
    content: `<div class="grid c4">${stat("Collected today", ghs(7850), "14 payments")}${stat("Outstanding (Term 2)", ghs(78800), "142 pupils owe")}${stat("Overdue > 30 days", ghs(38950), "46 invoices", "bad")}${stat("Cash in drawer (expected)", ghs(2300), "Not yet counted", "warn")}</div>
    <div class="grid g21 mt">${card("Today's payments", table(["Receipt", "Pupil", "Method", "Amount", "By", ""], [
      ["R-2027-0873", "Kwame Mensah · P4A", badge("MoMo", "brand"), ghs(800), "Online", btn("Print", "s")],
      ["R-2027-0872", "Efua Quaye · KG2", badge("Cash"), ghs(350), "Kojo", btn("Print", "s")],
      ["R-2027-0871", "Yaw Asante · JHS1B", badge("Bank", "info"), ghs(1200), "Kojo", btn("Print", "s")],
      ["R-2027-0870", "Adwoa Darko · P2A", badge("MoMo", "brand"), ghs(500), "Kojo", btn("Print", "s")]], { cls: ["", "", "", "r", "", "r"] }))}
    ${card("Collections by method", [["Mobile money", 62], ["Cash", 24], ["Bank deposit", 14]].map(([m, p]) => `<div class="row" style="margin:8px 0"><span style="width:100px">${m}</span><div class="sp">${bar(p)}</div><b>${p}%</b></div>`).join(""))}</div>` }),
  notes: [`${n(1)}Bursar lands on money: today's receipts, overdue, and what the drawer should hold.`, `${n(2)}Online (parent-initiated) payments appear automatically with receipt numbers.`],
  reqs: ["FR-FEE-14", "FR-FEE-15"],
});

// ───────── Setup ─────────
add({
  id: "W04", slug: "setup-calendar", group: "2 · School setup", title: "Academic years, terms & calendar", route: "/setup/calendar", roles: "Admin",
  html: shell({ active: "Setup", title: "Academic calendar", crumb: "Setup", actions: btn("+ New academic year", "p"),
    content: `${tabs(["Years & terms", "Holidays & closures", "Classes", "Subjects", "Grading", "Fees"], 0)}
    <div class="grid g21">${card("2026 / 2027 " + badge("Current", "good"), table(["Term", "Starts", "Ends", "Vacation", "Next term begins", "Days open", ""], [
      ["Term 1", "08 Sep 2026", "18 Dec 2026", "18 Dec 2026", "12 Jan 2027", "62", badge("Closed")], ["<b>Term 2</b> " + badge("Current", "brand"), "12 Jan 2027", "09 Apr 2027", "09 Apr 2027", "03 May 2027", "58 (auto)", btn("Edit", "s")], ["Term 3", "03 May 2027", "23 Jul 2027", "23 Jul 2027", "07 Sep 2027", "—", btn("Edit", "s")]]))}
    ${card("Term 2 — edit", field("Start date", "12 Jan 2027") + field("End date", "09 Apr 2027") + field("Vacation date (printed on report)", "09 Apr 2027") + field("Next term begins", "03 May 2027") + field("Days school opens", "Auto from calendar", { sel: true, hint: "Override only if needed" }) + btn("Save term", "p"))}</div>
    <div class="mt">${card("Holidays & closures (Term 2)", `<div class="chips">${["Independence Day · 06 Mar", "Good Friday · 26 Mar", "Easter Monday · 29 Mar", "Staff retreat · 19 Feb", "+ Add holiday"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>`)}</div>` }),
  notes: [`${n(1)}Only one current year/term; switching "current" moves the whole app (attendance, scores, invoices).`, `${n(2)}"Days open" auto-counts weekdays minus holidays; printed as "Attendance: 49 out of 58".`, `${n(3)}Vacation and reopening dates appear on every report card.`],
  reqs: ["FR-SET-02", "FR-SET-03"],
});

add({
  id: "W05", slug: "setup-classes", group: "2 · School setup", title: "Levels & classes", route: "/setup/classes", roles: "Admin",
  html: shell({ active: "Setup", title: "Levels & classes", crumb: "Setup", actions: btn("+ Add class", "p"),
    content: `${tabs(["Years & terms", "Holidays & closures", "Classes", "Subjects", "Grading", "Fees"], 2)}
    <div class="grid c3">${[["Nursery", [["Nursery 1", "Ms. Owusu", 24, 28], ["Nursery 2", "Ms. Adu", 26, 28]]], ["KG", [["KG 1", "Mrs. Tetteh", 30, 32], ["KG 2", "Mr. Nkansah", 31, 32]]], ["Primary", [["Primary 1 A", "Ms. Agyei", 29, 32], ["Primary 1 B", "Mr. Sarpong", 28, 32], ["Primary 2 A", "Mrs. Danso", 33, 36], ["Primary 3 A", "Ms. Amponsah", 34, 36], ["Primary 3 B", "Mr. Yeboah", 33, 36], ["… Primary 4–6", "", "", ""]]], ["JHS", [["JHS 1 A", "Mr. Ofori", 38, 40], ["JHS 1 B", "Mrs. Bonsu", 37, 40], ["JHS 2 A", "Mr. Kyei", 35, 40], ["JHS 3 A", "Mr. Fordjour", 40, 40]]]].map(([s, cl]) => card(s + " " + badge(String(cl.length) + " classes"), cl.map(([c, t, e, cap]) => `<div class="row-s"><b style="width:100px">${c}</b><span class="sp muted small">${t ? "Class teacher: " + t : ""}</span>${e ? `<span class="small">${e}/${cap}</span>` : ""}</div>`).join(""))).join("")}</div>` }),
  notes: [`${n(1)}Levels (Nursery 1 … JHS 3) are seeded; school toggles which it runs and adds streams (A/B/C).`, `${n(2)}Class teacher gets attendance + remarks rights for that class automatically.`],
  reqs: ["FR-SET-04"],
});

add({
  id: "W06", slug: "setup-subjects", group: "2 · School setup", title: "Subjects & teacher assignment", route: "/setup/subjects", roles: "Admin, Head",
  html: shell({ active: "Setup", title: "Subjects & teachers", crumb: "Setup", actions: btn("Copy from last year", "") + btn("+ Add subject", "p"),
    content: `${tabs(["Years & terms", "Holidays & closures", "Classes", "Subjects", "Grading", "Fees"], 3)}
    <div class="filters"><div class="inp sel">Class: JHS 1 A</div><span class="muted small">Academic year 2026/2027</span></div>
    ${table(["Subject", "Teacher", "Core?", "Components used", "Status"], [
      ["Mathematics", "Mr. Ofori", "Core", "Class score 50 · Exam 50", badge("Ready", "good")], ["English Language", "Mrs. Bonsu", "Core", "Class score 50 · Exam 50", badge("Ready", "good")],
      ["Integrated Science", "Mr. Kyei", "Core", "Class score 50 · Exam 50", badge("Ready", "good")], ["Social Studies", "Ms. Agyei", "Core", "Class score 50 · Exam 50", badge("Ready", "good")],
      ["ICT", `<span class="inp sel" style="min-height:28px;display:inline-flex;min-width:170px">Choose teacher…</span>`, "Core", "Class score 50 · Exam 50", badge("No teacher", "warn")],
      ["French", "Mr. Mensah", "Elective", "Class score 50 · Exam 50", badge("Ready", "good")]])}` }),
  notes: [`${n(1)}Assignment is per class per year → teacher changes mid-career do not rewrite history.`, `${n(2)}A subject without a teacher blocks score entry and is flagged on the setup checklist.`],
  reqs: ["FR-SET-05", "FR-RPT-02"],
});

// ───────── People ─────────
add({
  id: "W07", slug: "students-list", group: "3 · People & admissions", title: "Students list", route: "/students", roles: "Admin, Head, Registrar, Bursar, Teacher",
  html: shell({ active: "Students", title: "Students", crumb: "People", actions: btn("Import Excel", "") + btn("Export", "") + btn("+ Add student", "p"),
    content: `${filters([`<div class="inp" style="min-width:260px">Search name, admission no., guardian phone…</div>`, "Level: All", "Class: All", "Status: Active", "Balance: Any"])}
    ${table(["", "Pupil", "Adm. no.", "Class", "Guardian", "Attendance", "Balance", "Status", ""], KIDS.slice(0, 8).map((k, i) => [av(k[0]), `<b>${k[0]}</b>`, k[1], ["P4 A", "P4 A", "JHS 1 B", "P2 A", "JHS 1 B", "KG 2", "P6 A", "P3 B"][i], ["Mr. K. Mensah", "Mrs. A. Boateng", "Mr. J. Owusu", "Ms. E. Serwaa", "Mr. P. Asante", "Mrs. R. Osei", "Mr. S. Frimpong", "Mrs. G. Adjei"][i] + "<br><span class='small muted'>+233 24 5" + (500 + i * 37) + " 01" + (10 + i) + "</span>", ["96%", "91%", "88%", "99%", "72%", "94%", "97%", "90%"][i], i % 3 === 1 ? `<b style="color:var(--bad)">${ghs(450 + i * 120)}</b>` : ghs(0), i === 4 ? badge("Suspended", "warn") : badge("Active", "good"), btn("View", "s")]), { cls: ["", "", "", "", "", "r", "r", "", "r"] })}
    <div class="row mt2 muted small"><span>412 students</span><span class="sp"></span><span>‹ 1 2 3 … 21 ›</span></div>` }),
  notes: [`${n(1)}Search matches name, admission number and guardian phone (parents often call with just a phone).`, `${n(2)}Balance is red only when positive; teachers don't see the fee column.`, `${n(3)}Import/Export handle Excel — schools live in spreadsheets today.`],
  reqs: ["FR-PPL-04", "FR-PPL-05"],
});

add({
  id: "W08", slug: "student-profile", group: "3 · People & admissions", title: "Student profile", route: "/students/[id]", roles: "Admin, Head, Registrar (Bursar: fees tab)",
  html: shell({ active: "Students", title: "Kwame Mensah", crumb: "Students / BFA-0412", actions: btn("Message guardian", "") + btn("Edit", "") + btn("Statement", "p"),
    content: `<div class="grid g13"><div class="card c"><div class="av" style="width:88px;height:88px;margin:0 auto 10px;font-size:28px">KM</div><h3>Kwame Mensah</h3><div class="muted small">Primary 4 A · Boy · 10 yrs</div><div class="mt2">${badge("Active", "good")} ${badge("Sibling 10%", "info")}</div><div class="hr"></div>
      <dl class="kv" style="text-align:left"><dt>Adm. no.</dt><dd>BFA-0412</dd><dt>DOB</dt><dd>14 Mar 2016</dd><dt>Admitted</dt><dd>08 Sep 2023</dd><dt>Hometown</dt><dd>Mampong</dd><dt>Medical</dt><dd>Asthma</dd></dl></div>
     <div>${tabs(["Overview", "Guardians", "Attendance", "Results", "Fees", "Documents", "Activity"], 0)}
      <div class="grid c3">${stat("Attendance (Term 2)", "96%", "47 of 49 days", "good")}${stat("Term 1 position", "5th / 33", "Average 71.4")}${stat("Fee balance", ghs(0), "Paid in full", "good")}</div>
      <div class="grid c2 mt">${card("Guardians", [["Mr. Kofi Mensah", "Father", "+233 24 555 0147", "Primary · Fee payer"], ["Mrs. Adwoa Mensah", "Mother", "+233 20 441 9082", "SMS alerts"]].map(([a, b, c, d]) => `<div class="row-s">${av(a.replace(/Mr\.|Mrs\./, "").trim())}<div class="sp"><b>${a}</b> <span class="muted small">${b}</span><br><span class="small">${c}</span></div>${badge(d, "brand")}</div>`).join(""))}
      ${card("Recent activity", [["Absent · Mon 8 Feb (SMS sent)", "yesterday"], ["Payment GH₵800 · MoMo", "2 d ago"], ["Report card Term 1 published", "18 Dec"]].map(([a, b]) => `<div class="row-s"><span class="dot"></span><span class="sp">${a}</span><span class="muted small">${b}</span></div>`).join(""))}</div></div></div>` }),
  notes: [`${n(1)}One hub per child; tabs reuse the same components as the module screens.`, `${n(2)}Fees tab is hidden for teachers; Documents tab holds birth certificate / transfer letter.`, `${n(3)}Status changes (withdraw, transfer) open a reason dialog — audit-logged.`],
  reqs: ["FR-PPL-01", "FR-PPL-02", "FR-PPL-06", "FR-PPL-11"],
});

add({
  id: "W09", slug: "student-add", group: "3 · People & admissions", title: "Add student (with guardian)", route: "/students/new", roles: "Admin, Registrar",
  html: shell({ active: "Students", title: "Add student", crumb: "Students / New", actions: btn("Cancel", "") + btn("Save & add another", "") + btn("Save student", "p"),
    content: `<div class="grid g21"><div>${card("Pupil", `<div class="grid c3">${field("First name", "Kwame")}${field("Middle name", "")}${field("Last name", "Mensah")}${field("Gender", "Male", { sel: true })}${field("Date of birth", "14 Mar 2016")}${field("Admission no.", "BFA-0412", { hint: "Auto — next in sequence" })}${field("Level", "Primary 4", { sel: true })}${field("Class", "Primary 4 A", { sel: true, hint: "34 of 36 places filled" })}${field("Admission date", "08 Sep 2026")}</div>${field("Previous school", "Little Angels Prep", {})}${field("Medical notes / allergies", "Asthma — inhaler in bag", { area: true })}`)}
     <div class="mt">${card("Guardian", `<div class="grid c3">${field("Full name", "Kofi Mensah")}${field("Phone (SMS / MoMo)", "+233 24 555 0147", { err: true, hint: "⚠ This number already belongs to Mrs. Adwoa Mensah (2 children). Link instead?" })}${field("Relationship", "Father", { sel: true })}</div><div class="row">${btn("Link existing guardian", "s")}<span class="small muted">☑ Primary contact  ☑ Pays fees  ☑ Receives SMS</span></div>`)}</div></div>
     <div>${card("Photo & documents", `<div class="empty">Drop passport photo</div><div class="empty mt2">Birth certificate (optional)</div>`)}<div class="mt">${card("Billing", field("Discount", "Sibling 10%", { sel: true }) + `<label class="small"><input type="checkbox" checked> Generate admission invoice now</label>`)}</div></div></div>` }),
  notes: [`${n(1)}Duplicate guardian phone detection prevents the same parent being created twice — link instead (siblings share one portal login).`, `${n(2)}Admission number is generated transactionally from a per-school sequence.`, `${n(3)}New student immediately appears on that class's attendance register.`],
  reqs: ["FR-PPL-01", "FR-PPL-02", "FR-PPL-03"],
});

add({
  id: "W10", slug: "student-import", group: "3 · People & admissions", title: "Bulk import (Excel/CSV)", route: "/students/import", roles: "Admin, Registrar",
  html: shell({ active: "Students", title: "Import students", crumb: "Students / Import", actions: btn("Download template", "") + btn("Import 288 valid rows", "p"),
    content: `<div class="row" style="margin-bottom:14px">${["1 Upload", "2 Map columns", "3 Preview & fix", "4 Done"].map((s, i) => `<span class="chip ${i === 2 ? "on" : ""}">${s}</span>`).join("")}</div>
    <div class="grid c3">${stat("Rows read", "300")}${stat("Valid", "288", "", "good")}${stat("Need fixing", "12", "", "bad")}</div>
    <div class="mt">${table(["Row", "Pupil", "Class", "Guardian phone", "Result"], [
      ["2", "Kwame Mensah", "Primary 4 A", "0245550147", badge("OK · will link guardian", "good")], ["3", "Akosua Boateng", "Primary 4 A", "0245550147", badge("OK · sibling of row 2", "good")],
      ["17", "Kofi Owusu", "Primary 7 A", "0201234567", badge("Unknown class “Primary 7 A”", "bad")], ["21", "Ama Serwaa", "KG 2", "024555", badge("Invalid phone", "bad")], ["33", "Yaw Asante", "JHS 1 B", "0243332211", badge("DOB missing", "warn")]])}</div>` }),
  notes: [`${n(1)}Phones normalised to +233 and de-duplicated: siblings in the file share one guardian automatically.`, `${n(2)}Invalid rows are downloadable as an error sheet — the valid ones can be imported now.`],
  reqs: ["FR-PPL-05"],
});

add({
  id: "W11", slug: "admissions-pipeline", group: "3 · People & admissions", title: "Admissions pipeline", route: "/admissions", roles: "Admin, Registrar, Head",
  html: shell({ active: "Admissions", title: "Admissions 2026/2027", crumb: "People", actions: btn("Copy public form link", "") + btn("+ New application", "p"),
    content: `<div class="grid c4">${[["Submitted", 9, ["Efua Quaye · KG 2", "Fiifi Annan · P1", "Adwoa Darko · N2"]], ["Under review", 5, ["Kwesi Badu · P3 (test Sat)", "Nana Ama · JHS 1"]], ["Accepted", 4, ["Yaw Boadu · P5", "Esi Mensah · KG 1"]], ["Enrolled", 21, ["Kojo Adjei · P2", "Abena Osei · P1"]]].map(([h, c, items]) => card(h + " " + badge(String(c)), items.map((i) => `<div class="stu" style="margin-bottom:8px;display:block"><b>${i.split(" · ")[0]}</b><div class="small muted">${i.split(" · ")[1]}</div></div>`).join(""))).join("")}</div>` }),
  notes: [`${n(1)}Drag a card to move stage; "Enrol" converts it to a student + guardian + class placement and (optionally) an admission invoice.`, `${n(2)}Applicants receive an SMS with their reference at each decision.`],
  reqs: ["FR-PPL-07", "FR-PPL-08"],
});

add({
  id: "W12", slug: "staff", group: "3 · People & admissions", title: "Staff directory", route: "/staff", roles: "Admin, Head",
  html: shell({ active: "Staff", title: "Staff", crumb: "People", actions: btn("+ Add staff", "p"),
    content: `${table(["", "Name", "Job title", "Class / subjects", "Phone", "Login", ""], [
      [av("Ofori Mensah"), "<b>Mr. Ofori Mensah</b>", "Class teacher", "JHS 1 A · Mathematics", "+233 24 411 0092", badge("Teacher", "info"), btn("Edit", "s")],
      [av("Bonsu Ama"), "<b>Mrs. Ama Bonsu</b>", "Class teacher", "JHS 1 B · English", "+233 20 118 7743", badge("Teacher", "info"), btn("Edit", "s")],
      [av("Kojo Mensima"), "<b>Mr. Kojo Mensima</b>", "Bursar", "—", "+233 24 902 5531", badge("Bursar", "brand"), btn("Edit", "s")],
      [av("Grace Tetteh"), "<b>Mrs. Grace Tetteh</b>", "Headteacher", "—", "+233 24 000 1112", badge("Headteacher", "good"), btn("Edit", "s")]])}` }),
  notes: [`${n(1)}Adding staff can also create a login + role in one step.`, `${n(2)}Shows exactly which classes and subjects each teacher owns (drives their permissions).`],
  reqs: ["FR-PPL-09", "FR-AUTH-03"],
});

add({
  id: "W13", slug: "promotion-wizard", group: "3 · People & admissions", title: "Year-end promotion wizard", route: "/students/promotion", roles: "Admin, Head",
  html: shell({ active: "Students", title: "Promote students to 2027/2028", crumb: "Students / Promotion", actions: btn("Back", "") + btn("Confirm promotion", "p"),
    content: `<div class="row" style="margin-bottom:14px">${["1 Pick classes", "2 Decisions", "3 Preview", "4 Confirm"].map((s, i) => `<span class="chip ${i === 1 ? "on" : ""}">${s}</span>`).join("")}</div>
    <div class="grid g12"><div>${card("Primary 4 A → Primary 5 A", `<div class="small muted">34 pupils · Term 3 results published</div><div class="mt2">${chips(["Promote all", "Repeat selected", "Graduate"], 0)}</div><div class="hr"></div><div class="small">New class teacher: <b>Mr. Sarpong</b></div>`)}</div>
    ${table(["Pupil", "Avg", "Position", "Decision"], [["Kwame Mensah", "71.4", "5th", badge("Promote", "good")], ["Akosua Boateng", "83.2", "1st", badge("Promote", "good")], ["Kofi Owusu", "38.1", "34th", badge("Repeat", "warn")], ["Ama Serwaa", "64.0", "12th", badge("Promote", "good")]], { cls: ["", "r", "r", ""] })}</div>` }),
  notes: [`${n(1)}Suggests "Repeat" when overall average is under the school's pass mark; always editable.`, `${n(2)}Creates next-year enrolments only — past enrolments and results are untouched. JHS 3 → Graduated.`, `${n(3)}Preview shows new class sizes before confirming.`],
  reqs: ["FR-PPL-10"],
});
