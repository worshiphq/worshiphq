import { shell, phone, card, stat, table, badge, btn, av, bar, field, tabs, chips, seg, filters, n, KIDS, ghs } from "./lib.mjs";

export const pages = [];
const add = (p) => pages.push(p);

// ───────── Attendance ─────────
const reg = [["Kwame Mensah", "P"], ["Akosua Boateng", "P"], ["Kofi Owusu", "A"], ["Ama Serwaa", "P"], ["Yaw Asante", "L"], ["Abena Osei", "P"], ["Nana Yaa Frimpong", "E"], ["Kojo Adjei", "P"], ["Efua Quaye", "P"]];
const TX = { P: "Present", A: "Absent", L: "Late", E: "Excused" };

add({
  id: "W14", slug: "attendance-take-mobile", group: "4 · Attendance", title: "Take attendance (teacher, phone)", route: "/classes/[id]/attendance", roles: "Teacher (own class), Admin, Head", width: 430, kind: "phone",
  html: phone({ title: "Primary 4 A", sub: "Tue 9 Feb · 34 pupils · Mr. Sarpong", nav: ["Home", "Attendance", "Scores", "Remarks"], onNav: 1, body: `
   <div class="row">${seg(["Today", "Pick date"], 0)}<span class="sp"></span>${btn("Mark all present", "s")}</div>
   <div class="row small"><span class="badge good">29 Present</span><span class="badge bad">3 Absent</span><span class="badge warn">1 Late</span><span class="badge info">1 Excused</span></div>
   ${reg.map(([nm, s]) => `<div class="stu"><span class="av">${nm.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><span class="nm">${nm}</span><span class="tap ${s}">${TX[s]}</span></div>`).join("")}
   <div class="small muted c">… 25 more</div>
   ${btn("Submit register (SMS 3 guardians)", "p l")}` }),
  notes: [`${n(1)}One tap on the status cycles Present → Absent → Late → Excused. "Mark all present" first, then fix exceptions: ~40 pupils in under a minute.`, `${n(2)}Draft saves locally if signal drops and syncs automatically; header shows "Saved offline".`, `${n(3)}Submitting records the time and triggers absence SMS to guardians (once per child per day, respecting SMS flag and credits).`, `${n(4)}Holidays/weekends are blocked; teachers can't mark other classes.`],
  reqs: ["FR-ATT-01", "FR-ATT-02", "FR-ATT-03", "FR-ATT-04", "FR-ATT-06"],
});

add({
  id: "W15", slug: "attendance-today", group: "4 · Attendance", title: "Attendance today (school-wide)", route: "/attendance", roles: "Admin, Head",
  html: shell({ active: "Today", title: "Attendance today", crumb: "Attendance · Tue 9 Feb 2027", actions: btn("Remind unsubmitted", "") + btn("Export", ""),
    content: `<div class="grid c4">${stat("Present", "92%", "379 / 412", "good")}${stat("Absent", "27", "11 excused")}${stat("Late", "6")}${stat("Registers missing", "3", "of 16 classes", "warn")}</div>
    <div class="mt">${table(["Class", "Teacher", "Register", "Present", "Absent", "Late", "Attendance", ""], [
      ["Nursery 1", "Ms. Owusu", badge("Submitted 07:52", "good"), 22, 2, 0, bar(92, "good"), btn("Open", "s")], ["KG 2", "Mr. Nkansah", badge("Submitted 08:05", "good"), 29, 1, 1, bar(97, "good"), btn("Open", "s")],
      ["Primary 3 B", "Mr. Yeboah", badge("Not submitted", "bad"), "—", "—", "—", bar(0), btn("Remind", "s")], ["Primary 4 A", "Mr. Sarpong", badge("Submitted 07:49", "good"), 29, 3, 1, bar(88, "good"), btn("Open", "s")],
      ["Primary 5 A", "Mrs. Danso", badge("Not submitted", "bad"), "—", "—", "—", bar(0), btn("Remind", "s")], ["JHS 1 A", "Mr. Ofori", badge("Not submitted", "bad"), "—", "—", "—", bar(0), btn("Remind", "s")], ["JHS 3 A", "Mr. Fordjour", badge("Submitted 07:44", "good"), 36, 4, 0, bar(90, "good"), btn("Open", "s")]], { cls: ["", "", "", "r", "r", "r", "", "r"] })}</div>
    <div class="mt">${card("Chronic absence (3+ days in a row)", table(["Pupil", "Class", "Days absent", "Last reason", "Guardian", ""], [["Kofi Owusu", "P4 A", "4", "Unknown", "+233 20 123 4567", btn("Message", "s")], ["Yaw Asante", "JHS 1 B", "3", "Sick", "+233 24 333 2211", btn("Message", "s")]]))}</div>` }),
  notes: [`${n(1)}"Not submitted" is the key signal — teachers get an in-app + SMS reminder from here.`, `${n(2)}Chronic-absence list (≥3 days or <85%) offers one-tap guardian message.`],
  reqs: ["FR-ATT-03", "FR-ATT-07", "FR-ATT-09"],
});

const days = Array.from({ length: 20 }, (_, i) => i + 1);
const pat = (seed) => days.map((d) => ["P", "P", "P", "P", "P", "P", "P", "A", "P", "L", "P", "P", "E", "P", "P", "P"][(d * seed + seed) % 16]);
add({
  id: "W16", slug: "attendance-class-report", group: "4 · Attendance", title: "Class attendance report (term grid)", route: "/attendance/classes/[id]", roles: "Admin, Head, Class teacher",
  html: shell({ active: "Class reports", title: "Primary 4 A — Term 2 attendance", crumb: "Attendance / Class reports", actions: btn("Print", "") + btn("Export Excel", "p"),
    content: `${filters(["Class: Primary 4 A", "Term 2", "Weeks 1–4"])}
    <div class="row small" style="margin-bottom:10px"><span class="sq P"></span>Present <span class="sq A"></span>Absent <span class="sq L"></span>Late <span class="sq E"></span>Excused <span class="sq X"></span>No school</div>
    ${table(["Pupil", ...days.map((d) => `<span class='small'>${d}</span>`), "Present", "Absent", "Excused", "%"], KIDS.slice(0, 9).map((k, i) => { const row = pat(i + 2); const c = (x) => row.filter((v) => v === x).length; const pres = c("P") + c("L"); return [`<b>${k[0]}</b>`, ...row.map((st) => `<span class="sq ${st}"></span>`), pres, c("A"), c("E"), `<b>${Math.round((pres / row.length) * 100)}%</b>`]; }), { cls: ["", ...days.map(() => "c"), "r", "r", "r", "r"] })}
    <div class="mt small muted">Days opened (register submitted): 49 · Used on report cards as "Attendance: x out of 49"</div>` }),
  notes: [`${n(1)}Colour AND letter/label in real build (never colour-only) — here simplified to squares.`, `${n(2)}Percentage = (present + late) ÷ days the register was submitted (excused days stay in the denominator; shown separately).`, `${n(3)}Clicking a cell opens an edit dialog for admin/head (audit-logged).`],
  reqs: ["FR-ATT-07", "FR-ATT-08"],
});


add({
  id: "W17", slug: "attendance-student", group: "4 · Attendance", title: "Student attendance detail", route: "/students/[id]/attendance", roles: "Admin, Head, Class teacher, Registrar",
  html: shell({ active: "Class reports", title: "Kofi Owusu — attendance", crumb: "Students / BFA-0415 / Attendance", actions: btn("Message guardian", "") + btn("Excuse absence", "p"),
    content: `<div class="grid c4">${stat("Term 2", "72%", "35 of 49 days", "bad")}${stat("Absent", "13", "6 unexplained")}${stat("Late", "1")}${stat("Current streak", "4 days absent", "since Thu 4 Feb", "bad")}</div>
    <div class="grid g21 mt">${card("February 2027", `<table style="text-align:center"><tr>${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => `<th class="c">${d}</th>`).join("")}</tr>${[["P", "P", "P", "P", "P"], ["P", "P", "L", "P", "P"], ["P", "A", "A", "A", "A"], ["A", "A", "", "", ""]].map((w) => `<tr>${w.map((c) => `<td class="c">${c ? `<span class="sq ${c}" style="width:26px;height:26px"></span>` : ""}</td>`).join("")}</tr>`).join("")}</table><div class="row small mt2"><span class="sq P"></span>Present <span class="sq A"></span>Absent <span class="sq L"></span>Late <span class="sq E"></span>Excused</div>`)}
    ${card("Absence log", table(["Date", "Status", "Reason", "SMS"], [["Tue 9 Feb", badge("Absent", "bad"), "—", badge("Sent", "good")], ["Mon 8 Feb", badge("Absent", "bad"), "—", badge("Sent", "good")], ["Fri 5 Feb", badge("Absent", "bad"), "Guardian called: sick", badge("Excused", "info")], ["Thu 4 Feb", badge("Absent", "bad"), "—", badge("Sent", "good")]]))}</div>` }),
  notes: [`${n(1)}Streak and percentage are computed live from daily records; "Excuse absence" converts Absent → Excused with a reason (audit-logged) and does not re-send SMS.`, `${n(2)}Same view powers the Attendance tab in the student profile (W08).`],
  reqs: ["FR-ATT-07", "FR-ATT-09"],
});

// ───────── Report cards ─────────
add({
  id: "W18", slug: "assessment-setup", group: "5 · Assessment & report cards", title: "Assessment scheme & grading scale", route: "/setup/grading", roles: "Admin, Head",
  html: shell({ active: "Setup", title: "Assessment & grading", crumb: "Setup", actions: btn("Save changes", "p"),
    content: `${tabs(["Years & terms", "Holidays & closures", "Classes", "Subjects", "Grading", "Fees"], 4)}
    <div class="grid c2">${card("Scheme — JHS 1–3", table(["Component", "Marked out of", "Weight (of 100)", ""], [["Class score (SBA)", "50", "50", "⋯"], ["End-of-term exam", "100", "50", "⋯"]], { cls: ["", "r", "r", "r"], foot: `<tfoot><tr><td class="b">Total</td><td></td><td class="r b" style="color:var(--good)">100 ✓</td><td></td></tr></tfoot>` }) + `<div class="mt2">${btn("+ Add component", "s")}</div><div class="small muted mt2">Applies to: JHS 1, JHS 2, JHS 3 · Primary and KG use their own schemes.</div>`)}
    ${card("Grading scale — JHS (1–9)", table(["Grade", "From", "To", "Meaning", "Pass"], [["1", "80", "100", "Highest", "✓"], ["2", "70", "79", "Higher", "✓"], ["3", "60", "69", "High", "✓"], ["4", "55", "59", "High Average", "✓"], ["5", "50", "54", "Average", "✓"], ["6", "45", "49", "Low Average", "✓"], ["7", "40", "44", "Low", "—"], ["8", "35", "39", "Lower", "—"], ["9", "0", "34", "Lowest", "—"]], { cls: ["b", "r", "r", "", "c"] }) + `<div class="hint err mt2">⚠ Bands must cover 0–100 with no gaps or overlaps — validated on save.</div>`)}</div>` }),
  notes: [`${n(1)}Weights must sum to 100 — blocked otherwise; changing a scheme after scores exist asks for confirmation and recomputes results.`, `${n(2)}Nursery/KG use a RATING scale (Exceeding / Meeting / Approaching / Beginning) with no numeric marks.`, `${n(3)}Seeded bands are placeholders; each school confirms them against its current printed report card.`],
  reqs: ["FR-RPT-01", "FR-RPT-02", "FR-RPT-06"],
});

add({
  id: "W19", slug: "score-entry", group: "5 · Assessment & report cards", title: "Score entry grid", route: "/results/entry?class=…&subject=…", roles: "Teacher (own subjects), Admin",
  html: shell({ role: "teacher", active: "Score entry", title: "JHS 1 A · Mathematics — Term 2", crumb: "Results / Score entry", who: "Ofori Mensah", whoRole: "Teacher", actions: `<span class="badge good">All changes saved 09:14</span>` + btn("Submit to class teacher", "p"),
    content: `<div class="row" style="margin-bottom:12px">${filters(["Class: JHS 1 A", "Subject: Mathematics"])}<span class="sp"></span><span class="small muted">Tab / Enter to move · paste from Excel supported</span></div>
    ${table(["#", "Pupil", "Class score<br><span style='text-transform:none'>out of 50</span>", "Exam<br><span style='text-transform:none'>out of 100</span>", "Total /100", "Grade", "Position", "Remark"], [
      [1, "Kwame Mensah", `<div class="inp" style="justify-content:flex-end">42</div>`, `<div class="inp" style="justify-content:flex-end">71</div>`, "<b>77.5</b>", badge("2", "good"), "5th", "Higher"],
      [2, "Akosua Boateng", `<div class="inp" style="justify-content:flex-end">47</div>`, `<div class="inp" style="justify-content:flex-end">88</div>`, "<b>91.0</b>", badge("1", "good"), "1st", "Highest"],
      [3, "Kofi Owusu", `<div class="inp" style="justify-content:flex-end">20</div>`, `<div class="inp" style="justify-content:flex-end;border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe">41</div>`, "<b>40.5</b>", badge("7", "warn"), "34th", "Low"],
      [4, "Ama Serwaa", `<div class="inp err" style="justify-content:flex-end">55</div>`, `<div class="inp" style="justify-content:flex-end">72</div>`, `<span style="color:var(--bad)">Max is 50</span>`, "—", "—", ""],
      [5, "Yaw Asante", `<div class="inp" style="justify-content:flex-end">38</div>`, `<div class="inp ph0" style="justify-content:flex-end">—</div>`, `<span class="muted">Incomplete</span>`, "—", "—", badge("Exam missing", "warn")],
      [6, "Abena Osei", `<div class="inp" style="justify-content:flex-end">Abs</div>`, `<div class="inp" style="justify-content:flex-end">Abs</div>`, "0", badge("9", "bad"), "—", "Absent for exam"]], { cls: ["c", "", "r", "r", "r", "c", "c", ""] })}
    <div class="row mt2 small muted"><span>Class average 68.4 · Highest 91.0 · Lowest 40.5</span><span class="sp"></span><span>Completed 29 / 38</span></div>` }),
  notes: [`${n(1)}Blank is not zero: missing scores show "Incomplete" and block ranking; "Abs" counts 0 visibly.`, `${n(2)}Inline validation (score above max) and instant totals/grades so the teacher can sanity-check as they type.`, `${n(3)}Autosave + unsaved-changes guard; locks after the head approves the term.`, `${n(4)}Teacher only sees subjects they're assigned to.`],
  reqs: ["FR-RPT-03", "FR-RPT-04", "FR-RPT-09"],
});

add({
  id: "W20", slug: "completion-tracker", group: "5 · Assessment & report cards", title: "Score completion tracker", route: "/results/completion", roles: "Admin, Head",
  html: shell({ active: "Completion", title: "Score completion — Term 2", crumb: "Results", actions: btn("Remind teachers with gaps", "p"),
    content: `<div class="grid c4">${stat("Overall", "61%", "Deadline 20 Mar", "warn")}${stat("Complete classes", "5 / 16")}${stat("Teachers with gaps", "9", "", "bad")}${stat("Days to deadline", "6")}</div>
    <div class="mt">${table(["Class", "Maths", "English", "Science", "Social", "ICT", "French", "RME", "Overall"], [
      ["JHS 1 A", ...[100, 100, 85, 100, 40, 100, 100].map((v) => `<span class="badge ${v === 100 ? "good" : v > 60 ? "warn" : "bad"}">${v}%</span>`), "<b>89%</b>"],
      ["JHS 1 B", ...[100, 76, 100, 100, 0, 100, 90].map((v) => `<span class="badge ${v === 100 ? "good" : v > 60 ? "warn" : "bad"}">${v}%</span>`), "<b>81%</b>"],
      ["JHS 2 A", ...[60, 100, 100, 55, 100, 100, 100].map((v) => `<span class="badge ${v === 100 ? "good" : v > 60 ? "warn" : "bad"}">${v}%</span>`), "<b>88%</b>"],
      ["Primary 6 A", ...[100, 100, 100, 100, 100, 100, 100].map((v) => `<span class="badge good">${v}%</span>`), "<b>100%</b>"]], { cls: ["", "c", "c", "c", "c", "c", "c", "c", "c"] })}</div>` }),
  notes: [`${n(1)}Class × subject matrix; click a cell to see which pupils are missing and who the teacher is.`, `${n(2)}This is the head's chase list before approvals.`],
  reqs: ["FR-RPT-08"],
});

add({
  id: "W21", slug: "class-broadsheet", group: "5 · Assessment & report cards", title: "Class broadsheet & positions", route: "/results/broadsheet", roles: "Admin, Head, Class teacher",
  html: shell({ active: "Broadsheet", title: "JHS 1 A — Term 2 broadsheet", crumb: "Results", actions: btn("Print", "") + btn("Export Excel", "p"),
    content: `${filters(["Class: JHS 1 A", "Term 2"])}${table(["Pos", "Pupil", "Maths", "English", "Science", "Social", "ICT", "French", "RME", "Total", "Avg"], [
      ["1st", "Akosua Boateng", "91.0 (1)", "88.0 (1)", "92.0 (1)", "85.5 (2)", "91 (1)", "80 (3)", "87 (1)", "<b>614.5</b>", "87.8"],
      ["2nd", "Nana Yaa Frimpong", "84.0 (3)", "86.5 (2)", "80.0 (3)", "88.0 (1)", "82 (3)", "85 (1)", "81 (2)", "<b>586.5</b>", "83.8"],
      ["3rd", "Kwame Mensah", "77.5 (5)", "79.0 (4)", "75.5 (5)", "74.0 (6)", "80 (4)", "70 (8)", "76 (4)", "<b>532.0</b>", "76.0"],
      ["3rd", "Ama Serwaa", "78.0 (4)", "74.0 (6)", "76.0 (4)", "77.0 (4)", "74 (6)", "75 (5)", "78 (3)", "<b>532.0</b>", "76.0"],
      ["5th", "Kofi Owusu", "40.5 (34)", "45.0 (30)", "38.0 (35)", "42.0 (33)", "50 (28)", "<span class='badge warn'>missing</span>", "44 (31)", "<span class='muted'>incomplete</span>", "—"]], { cls: ["c", "", "r", "r", "r", "r", "r", "r", "r", "r", "r"] })}
    <div class="small muted mt2">Ties share a position (3rd, 3rd) and the next is skipped (5th). Pupils with missing scores are listed but not ranked.</div>` }),
  notes: [`${n(1)}Subject score with subject position in brackets.`, `${n(2)}Ranking rule is stated on the sheet so parents/teachers can verify by hand.`, `${n(3)}Subject performance analysis (avg / high / low / grade spread) sits on a second tab.`],
  reqs: ["FR-RPT-05", "FR-RPT-14"],
});

add({
  id: "W22", slug: "remarks-approval", group: "5 · Assessment & report cards", title: "Remarks & approval workflow", route: "/results/reports/[class]", roles: "Class teacher → Headteacher",
  html: shell({ active: "Report cards", title: "JHS 1 A — Report cards, Term 2", crumb: "Results / Report cards", who: "Grace Tetteh", whoRole: "Headteacher", actions: btn("Approve selected (28)", "") + btn("Publish approved…", "p"),
    content: `<div class="grid g21"><div>${chips(["All 38", "Draft 6", "Submitted 4", "Approved 28", "Published 0"], 2)}<div class="mt2">${table(["", "Pupil", "Pos", "Conduct", "Class teacher remark", "Head remark", "Status"], [
      ["☑", "Akosua Boateng", "1st", "Excellent", "A diligent, focused pupil.", "Keep it up.", badge("Submitted", "info")],
      ["☑", "Nana Yaa Frimpong", "2nd", "Very good", "Participates well in class.", "Well done.", badge("Submitted", "info")],
      ["☐", "Kwame Mensah", "3rd", "Good", `<span class="muted">Add remark…</span>`, "", badge("Draft", "")],
      ["☑", "Ama Serwaa", "3rd", "Good", "Can do even better in French.", "Good effort.", badge("Approved", "good")]])}</div></div>
    ${card("Kwame Mensah", field("Conduct", "Good", { sel: true }) + field("Interest", "Football, reading", {}) + field("Attitude", "Positive", { sel: true }) + field("Class teacher remark", "A pleasant pupil who must read more.", { area: true }) + `<div class="small muted">Suggestions: <span class="chip">Hard-working</span> <span class="chip">Needs to improve in…</span></div>`)}</div>` }),
  notes: [`${n(1)}Flow: Draft (teacher writes) → Submitted → Approved (head) → Published (parents see). Each step stamps who/when.`, `${n(2)}Comment bank suggests remarks by grade band to speed up 38 cards.`, `${n(3)}After approval, scores lock; unlocking needs a reason (audited).`],
  reqs: ["FR-RPT-07", "FR-RPT-09", "FR-RPT-15"],
});

const sheetTable = (rows, head) => `<table style="font-size:12px"><thead><tr>${head.map((h) => `<th style="background:#f3f4f6;color:#111;border:1px solid #bbb;text-align:center">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td style="border:1px solid #bbb;text-align:${i ? "center" : "left"}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
add({
  id: "W23", slug: "report-card-jhs", group: "5 · Assessment & report cards", title: "Report card — JHS (A4 print/PDF)", route: "/results/reports/[student]/pdf", roles: "Admin, Head, Teacher, Parent", width: 900,
  html: `<div class="sheet" style="width:794px">
   <div class="row" style="border-bottom:3px double #111;padding-bottom:10px"><div class="av" style="width:64px;height:64px;font-size:22px;border-radius:12px">BF</div><div class="sp c"><div style="font-size:22px;font-weight:800">BRIGHT FUTURE ACADEMY</div><div class="small">P. O. Box 214, Kumasi · 024 000 1112 · "Knowledge with Character"</div><div class="b" style="margin-top:4px;letter-spacing:.1em">TERMINAL REPORT — TERM 2, 2026/2027</div></div><div class="av" style="width:64px;height:64px;border-radius:8px">Photo</div></div>
   <div class="grid c3 small" style="margin:10px 0"><div><b>Name:</b> Kwame Mensah</div><div><b>Class:</b> JHS 1 A</div><div><b>Adm. no.:</b> BFA-0412</div><div><b>Position:</b> 3rd of 38</div><div><b>Attendance:</b> 47 out of 49</div><div><b>Average:</b> 76.0</div></div>
   ${sheetTable([["Mathematics", 42, 35.5, "77.5", "2", "5th", "Higher"], ["English Language", 40, 39, "79.0", "2", "4th", "Higher"], ["Integrated Science", 38, 37.5, "75.5", "2", "5th", "Higher"], ["Social Studies", 37, 37, "74.0", "2", "6th", "Higher"], ["ICT", 42, 38, "80.0", "1", "4th", "Highest"], ["French", 33, 37, "70.0", "2", "8th", "Higher"], ["RME", 39, 37, "76.0", "2", "4th", "Higher"]], ["Subject", "Class score (50)", "Exam (50)", "Total (100)", "Grade", "Pos.", "Remark"])}
   <div class="grid c2 small" style="margin-top:12px"><div><b>Conduct:</b> Good<br><b>Interest:</b> Football, reading<br><b>Attitude:</b> Positive</div><div><b>Vacation:</b> 09 Apr 2027<br><b>Next term begins:</b> 03 May 2027<br><b>Promoted to:</b> — (Term 3)</div></div>
   <div class="small" style="margin-top:10px;border:1px solid #bbb;padding:8px"><b>Class teacher:</b> A pleasant pupil who must read more.<br><b>Headteacher:</b> Good effort. Keep it up.</div>
   <div class="row small" style="margin-top:26px"><div class="sp">______________<br>Class teacher</div><div class="sp c">______________<br>Headteacher</div><div class="sp r">______________<br>Parent</div></div>
   <div class="small muted" style="margin-top:12px;border-top:1px solid #ccc;padding-top:6px">Grade key: 1 Highest (80–100) · 2 Higher (70–79) · 3 High (60–69) · 4 High Average (55–59) · 5 Average (50–54) · 6 Low Average (45–49) · 7 Low (40–44) · 8 Lower (35–39) · 9 Lowest (0–34)</div></div>`,
  notes: [`${n(1)}Layout follows the school's existing card; header/logo/motto/signature blocks configurable per school.`, `${n(2)}Fits one A4 page for up to ~12 subjects; batch PDF for a whole class is a queued job.`, `${n(3)}QR code (not shown) opens the verified digital copy so cards can't be forged.`],
  reqs: ["FR-RPT-10", "FR-RPT-11"],
});

add({
  id: "W24", slug: "report-card-nursery", group: "5 · Assessment & report cards", title: "Report card — Nursery / KG (A4)", route: "/results/reports/[student]/pdf", roles: "Admin, Head, Teacher, Parent", width: 900,
  html: `<div class="sheet" style="width:794px"><div class="c" style="border-bottom:3px double #111;padding-bottom:10px"><div style="font-size:22px;font-weight:800">BRIGHT FUTURE ACADEMY — KINDERGARTEN</div><div class="b" style="letter-spacing:.1em">PROGRESS REPORT — TERM 2, 2026/2027</div></div>
   <div class="grid c3 small" style="margin:10px 0"><div><b>Name:</b> Efua Quaye</div><div><b>Class:</b> KG 2</div><div><b>Attendance:</b> 44 out of 49</div></div>
   ${sheetTable([["Language & Literacy", "Meeting", "Recognises 18 of 26 letters"], ["Numeracy", "Exceeding", "Counts to 100, simple addition"], ["Our World, Our People", "Meeting", ""], ["Creative Arts", "Exceeding", "Loves drawing and singing"], ["Physical Development", "Approaching", "Working on balance"], ["Social & Emotional", "Meeting", "Shares and takes turns"]], ["Learning area", "Rating", "Teacher's note"])}
   <div class="small muted" style="margin:8px 0">Key: Exceeding · Meeting · Approaching · Beginning</div>
   <div class="small" style="border:1px solid #bbb;padding:8px"><b>Class teacher:</b> Efua is a happy, curious child. Please read with her every evening.<br><b>Next term begins:</b> 03 May 2027</div></div>`,
  notes: [`${n(1)}No marks and no position by default for Nursery/KG; ratings come from the school's rating scale.`, `${n(2)}A school may turn on ranking per level if it insists.`],
  reqs: ["FR-RPT-06", "FR-RPT-10"],
});

add({
  id: "W25", slug: "publish-reports", group: "5 · Assessment & report cards", title: "Publish & print report cards", route: "/results/publish", roles: "Admin, Head",
  html: shell({ active: "Report cards", title: "Publish Term 2 report cards", crumb: "Results / Report cards", actions: btn("Print all (PDF)", "") + btn("Publish 342 cards", "p"),
    content: `<div class="grid c4">${stat("Approved", "342", "ready to publish", "good")}${stat("Not approved", "70", "blocked", "warn")}${stat("Owing above threshold", "38", "GH₵ 200 limit", "bad")}${stat("Already published", "0")}</div>
    <div class="grid g21 mt">${table(["Class", "Approved", "Not approved", "Owing", "Action"], [["Nursery 1–2", "48 / 50", 2, 1, btn("Review", "s")], ["KG 1–2", "60 / 62", 2, 3, btn("Review", "s")], ["Primary 1–3", "98 / 110", 12, 11, btn("Review", "s")], ["Primary 4–6", "96 / 110", 14, 14, btn("Review", "s")], ["JHS 1–3", "40 / 80", 40, 9, btn("Review", "s")]], { cls: ["", "r", "r", "r", "r"] })}
    ${card("Publishing options", `<label class="small"><input type="checkbox" checked> Send SMS "report ready" to guardians</label><div class="hr"></div><div class="b small">Fees policy</div><label class="small"><input type="checkbox" checked> Hide cards where balance &gt; GH₵ 200</label><div class="hint">Parents see a polite notice; staff can override per pupil. Evaluated again each time the parent opens the card.</div><div class="hr"></div>${btn("Publish 342 cards", "p w")}`)}</div>` }),
  notes: [`${n(1)}Bulk publish only affects Approved cards; others stay hidden and listed.`, `${n(2)}"Withhold if owing" is opt-in per school (off by default) and uses live balances.`, `${n(3)}Print-all creates a background PDF job and notifies when ready.`],
  reqs: ["FR-RPT-10", "FR-RPT-11", "FR-RPT-12"],
});
