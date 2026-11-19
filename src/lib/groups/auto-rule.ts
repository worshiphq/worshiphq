import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { lockedAmong } from "@/lib/member-lock";
import { getFormDefinition, getTeensFormDefinition, getChildrenFormDefinition, questionFields } from "@/lib/forms/registration";
import { parseAutoRule, matchesRule, normalAnswer, isDayQuestion, weekdayFrom, WEEKDAYS, personAnswer, type AutoRule } from "./auto-rule-core";

/**
 * Put people into the groups whose rule they match.
 *
 * - personIds given (someone just registered or was edited): they join every rule group they
 *   match, and leave a rule group whose question they now answer differently (they moved day).
 * - personIds omitted (a rule was just set, or a list was imported): everyone who matches is
 *   added. Nobody is removed, so people a church added by hand stay where they are.
 *
 * Never throws: grouping must not break a registration or an import.
 */
export async function applyGroupRules(churchId: string, personIds?: string[]): Promise<number> {
  try {
    const groups = await db.group.findMany({
      where: { churchId, isActive: true, autoRule: { not: Prisma.DbNull } },
      select: { id: true, autoRule: true },
    });
    const ruled = groups.map((g) => ({ id: g.id, rule: parseAutoRule(g.autoRule) })).filter((g): g is { id: string; rule: AutoRule } => !!g.rule);
    if (ruled.length === 0) return 0;
    return await fillGroups(churchId, ruled, personIds);
  } catch (e) {
    console.error("[group-rules]", e);
    return 0;
  }
}

/** Fill one group from its rule (used right after the rule is saved). */
export async function applyRuleToGroup(churchId: string, groupId: string): Promise<number> {
  try {
    const g = await db.group.findFirst({ where: { id: groupId, churchId }, select: { id: true, autoRule: true } });
    const rule = parseAutoRule(g?.autoRule);
    if (!g || !rule) return 0;
    return await fillGroups(churchId, [{ id: g.id, rule }]);
  } catch (e) {
    console.error("[group-rules]", e);
    return 0;
  }
}

async function fillGroups(churchId: string, ruled: { id: string; rule: AutoRule }[], personIds?: string[]): Promise<number> {
  const people = await db.person.findMany({
    where: { churchId, status: { not: "visitor" }, ...(personIds ? { id: { in: personIds.slice(0, 2000) } } : {}) },
    select: { id: true, customFields: true, dateOfBirth: true, groups: { select: { id: true } } },
  });
  if (people.length === 0) return 0;
  const locked = new Set(await lockedAmong(churchId, people.map((p) => p.id)));

  let added = 0;
  for (const g of ruled) {
    const join: string[] = [];
    const leave: string[] = [];
    for (const p of people) {
      const inGroup = p.groups.some((x) => x.id === g.id);
      if (matchesRule(g.rule, p.customFields, p.dateOfBirth)) {
        if (!inGroup && !locked.has(p.id)) join.push(p.id);
      } else if (personIds && inGroup && personAnswer(g.rule.question, p.customFields, p.dateOfBirth)) {
        leave.push(p.id);
      }
    }
    for (let i = 0; i < join.length; i += 500) {
      await db.group.update({ where: { id: g.id }, data: { members: { connect: join.slice(i, i + 500).map((id) => ({ id })) } } });
    }
    if (leave.length) {
      await db.group.update({ where: { id: g.id }, data: { members: { disconnect: leave.map((id) => ({ id })) } } });
    }
    added += join.length;
  }
  return added;
}

export type RuleQuestion = { question: string; isDay: boolean; answers: { value: string; count: number }[] };

/**
 * The questions a group can be filled from: custom form questions plus any extra columns that
 * came in from an import, each with its answers and how many people gave them.
 */
export async function ruleQuestions(churchId: string): Promise<RuleQuestion[]> {
  const church = await db.church.findUnique({
    where: { id: churchId },
    select: { registrationFields: true, teensFormFields: true, childrenFormFields: true },
  });
  const formQs = [
    ...questionFields(getFormDefinition(church?.registrationFields ?? null)),
    ...questionFields(getTeensFormDefinition(church?.teensFormFields ?? null)),
    ...questionFields(getChildrenFormDefinition(church?.childrenFormFields ?? null)),
  ].filter((f) => !f.system && ["text", "select", "radio", "number"].includes(f.type));

  // Answers people actually gave, grouped in the database (small result).
  const rows = await db.$queryRaw<{ question: string; answer: string; n: number }[]>`
    SELECT k.key AS question, trim(k.value) AS answer, count(*)::int AS n
    FROM "Person" p, jsonb_each_text(p."customFields") k
    WHERE p."churchId" = ${churchId} AND p."status" <> 'visitor'
      AND jsonb_typeof(p."customFields") = 'object' AND trim(k.value) <> ''
    GROUP BY 1, 2 ORDER BY n DESC LIMIT 3000`;

  const byQ = new Map<string, { question: string; options: string[] | null; raw: Map<string, number> }>();
  const keyOf = (q: string) => q.trim().toLowerCase();
  for (const f of formQs) {
    const k = keyOf(f.label);
    if (!byQ.has(k)) byQ.set(k, { question: f.label.trim(), options: f.type === "select" || f.type === "radio" ? f.options ?? [] : null, raw: new Map() });
  }
  for (const r of rows) {
    const k = keyOf(r.question);
    if (!byQ.has(k)) byQ.set(k, { question: r.question.trim(), options: null, raw: new Map() });
    const e = byQ.get(k)!;
    e.raw.set(r.answer, (e.raw.get(r.answer) ?? 0) + r.n);
  }

  const out: RuleQuestion[] = [];
  for (const e of byQ.values()) {
    const isDay = isDayQuestion(e.question);
    const counts = new Map<string, { value: string; count: number }>();
    const add = (value: string, n: number) => {
      const norm = normalAnswer(e.question, value);
      if (!norm) return;
      const cur = counts.get(norm);
      if (cur) cur.count += n; else counts.set(norm, { value, count: n });
    };
    if (isDay) {
      for (const d of WEEKDAYS) counts.set(d.toLowerCase(), { value: d, count: 0 });
      for (const [v, n] of e.raw) { const d = weekdayFrom(v); if (d) counts.get(d.toLowerCase())!.count += n; }
      // People who skipped the question but gave a full date of birth join by that weekday too.
      const fromDob = await db.$queryRaw<{ dow: number; n: number }[]>`
        SELECT extract(dow from p."dateOfBirth")::int AS dow, count(*)::int AS n
        FROM "Person" p
        WHERE p."churchId" = ${churchId} AND p."status" <> 'visitor' AND p."dateOfBirth" >= '1910-01-01'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(p."customFields") = 'object' THEN p."customFields" ELSE '{}'::jsonb END) k
            WHERE lower(trim(k.key)) = ${e.question.trim().toLowerCase()} AND trim(k.value) <> '')
        GROUP BY 1`;
      for (const r of fromDob) counts.get(WEEKDAYS[r.dow].toLowerCase())!.count += r.n;
    } else {
      for (const o of e.options ?? []) add(o, 0);
      for (const [v, n] of e.raw) add(v, n);
    }
    const answers = [...counts.values()];
    // Free-text questions with lots of different answers (names, notes) can't make groups.
    // Free-text questions only qualify when answers repeat a lot (an area or zone, not names or numbers).
    const total = answers.reduce((t, a) => t + a.count, 0);
    if (!isDay && !e.options && (answers.length < 2 || answers.length > 20 || total / answers.length < 2)) continue;
    if (!isDay) answers.sort((a, b) => b.count - a.count);
    out.push({ question: e.question, isDay, answers });
  }
  // Day questions first, then the rest by name.
  return out.sort((a, b) => Number(b.isDay) - Number(a.isDay) || a.question.localeCompare(b.question));
}
