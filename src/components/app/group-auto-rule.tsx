"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { getGroupRuleQuestions, createGroupsFromAnswers } from "@/app/actions/groups";
import { WEEKDAYS, dayLabel, describeRule, type AutoRule } from "@/lib/groups/auto-rule-core";
import type { RuleQuestion } from "@/lib/groups/auto-rule";
import { cn } from "@/lib/utils";

const selectCls = "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

const answerLabel = (q: RuleQuestion, value: string) =>
  q.isDay && (WEEKDAYS as readonly string[]).includes(value) ? dayLabel(value as (typeof WEEKDAYS)[number]) : value;

/** Loads the questions once the picker is shown (they need a database read). */
function useRuleQuestions(active: boolean) {
  const [qs, setQs] = useState<RuleQuestion[] | null>(null);
  useEffect(() => {
    if (!active || qs) return;
    let gone = false;
    getGroupRuleQuestions().then((r) => { if (!gone) setQs(r); }).catch(() => { if (!gone) setQs([]); });
    return () => { gone = true; };
  }, [active, qs]);
  return qs;
}

/** Small badge for cards and the group page. */
export function AutoRuleBadge({ rule, className }: { rule: AutoRule; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info", className)} title="Fills itself from this form answer">
      <Wand2 className="size-3 shrink-0" /> <span className="truncate">Auto: {describeRule(rule)}</span>
    </span>
  );
}

/** Inside the create/edit group form: fill this group automatically from a form answer. */
export function AutoRuleFields({ initial }: { initial?: AutoRule | null }) {
  const [on, setOn] = useState(!!initial);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const qs = useRuleQuestions(on);
  const q = qs?.find((x) => x.question.toLowerCase() === question.toLowerCase());
  // A saved rule whose question no longer exists still shows, so saving doesn't silently drop it.
  const options = q?.answers ?? (initial && question === initial.question ? [{ value: initial.answer, count: 0 }] : []);
  const count = options.find((a) => a.value.toLowerCase() === answer.toLowerCase())?.count;

  return (
    <div className="rounded-xl border border-line p-3">
      <input type="hidden" name="autoRuleQuestion" value={on ? question : ""} />
      <input type="hidden" name="autoRuleAnswer" value={on ? answer : ""} />
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="flex items-center gap-2 text-sm font-medium"><Wand2 className="size-4 text-primary" /> Fill this group automatically</span>
          <span className="mt-0.5 block text-xs text-ink-faint">Everyone whose form answer matches joins, now and whenever someone signs up, is imported or is edited. Great for Day Born cell groups.</span>
        </span>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />
      </label>

      {on && (
        <div className="mt-3 space-y-2">
          {qs === null ? (
            <p className="flex items-center gap-2 text-xs text-ink-muted"><Loader2 className="size-3.5 animate-spin" /> Loading your form questions…</p>
          ) : qs.length === 0 && !initial ? (
            <p className="text-xs text-amber-600">Add a dropdown question (for example &quot;Day Born&quot;) to your member form first, in Settings, Forms.</p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Question</label>
                <select value={question} onChange={(e) => { setQuestion(e.target.value); setAnswer(""); }} className={selectCls}>
                  <option value="">Choose a question…</option>
                  {qs.map((x) => <option key={x.question} value={x.question}>{x.question}</option>)}
                  {initial && !qs.some((x) => x.question.toLowerCase() === initial.question.toLowerCase()) && <option value={initial.question}>{initial.question}</option>}
                </select>
              </div>
              {question && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Answer</label>
                  <select value={answer} onChange={(e) => setAnswer(e.target.value)} className={selectCls}>
                    <option value="">Choose an answer…</option>
                    {options.map((a) => (
                      <option key={a.value} value={a.value}>{q ? answerLabel(q, a.value) : a.value}{a.count ? ` - ${a.count} ${a.count === 1 ? "person" : "people"}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {q?.isDay && <p className="text-[11px] text-ink-faint">Day names are read smartly: Kwabena, Abena, &quot;Tue&quot; or a small typo all count as Tuesday.</p>}
              {question && answer && count !== undefined && <p className="text-xs text-success">{count} {count === 1 ? "person matches" : "people match"} right now and will be added when you save.</p>}
              {question && !answer && <p className="text-xs text-amber-600">Pick an answer, or switch this off.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Groups page: one group per answer (e.g. seven Day Born cell groups) in one go. */
export function GroupsFromAnswersButton() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [qs, setQs] = useState<RuleQuestion[] | null>(null);
  const [question, setQuestion] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [type, setType] = useState("Cell group");
  const [format, setFormat] = useState("{answer} Cell");
  const [busy, setBusy] = useState(false);

  const q = qs?.find((x) => x.question === question) ?? null;
  const choose = (next: RuleQuestion | undefined) => {
    setQuestion(next?.question ?? "");
    setPicked(Object.fromEntries((next?.answers ?? []).map((a) => [a.value, true])));
  };
  // Load fresh each time it opens, and start on the first question (Day Born comes first).
  function openDialog() {
    setOpen(true);
    setQs(null);
    getGroupRuleQuestions()
      .then((r) => { setQs(r); choose(r[0]); })
      .catch(() => setQs([]));
  }

  const chosen = q ? q.answers.filter((a) => picked[a.value]).map((a) => a.value) : [];

  async function create() {
    if (!q || chosen.length === 0) return;
    setBusy(true);
    const r = await createGroupsFromAnswers({ question: q.question, answers: chosen, type, nameFormat: format });
    setBusy(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    toast(`${r.created} group${r.created === 1 ? "" : "s"} created with ${r.filled} ${r.filled === 1 ? "person" : "people"}${r.skipped ? `, ${r.skipped} already existed` : ""}.`, "success");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={openDialog}><Wand2 /> Groups from answers</Button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Create groups from a form answer" description="One group for each answer, filled automatically. New people join the right group as they sign up.">
        {qs === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Loading your form questions…</p>
        ) : qs.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">There is no question to build groups from yet. Add a dropdown question such as &quot;Day Born&quot; to your member form in Settings, Forms, then come back.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">Question</label>
              <select
                value={question}
                onChange={(e) => choose(qs.find((x) => x.question === e.target.value))}
                className={selectCls}
              >
                {qs.map((x) => <option key={x.question} value={x.question}>{x.question}</option>)}
              </select>
            </div>

            {q && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Make a group for</label>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
                  {q.answers.map((a) => (
                    <label key={a.value} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" checked={!!picked[a.value]} onChange={(e) => setPicked((p) => ({ ...p, [a.value]: e.target.checked }))} className="size-4 accent-primary" />
                        <span className="truncate">{answerLabel(q, a.value)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{a.count} {a.count === 1 ? "person" : "people"}</span>
                    </label>
                  ))}
                </div>
                {q.isDay && <p className="mt-1 text-[11px] text-ink-faint">Counts include Akan names and small typos read as the right day.</p>}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Group name</label>
                <input value={format} onChange={(e) => setFormat(e.target.value)} className={selectCls} />
                <p className="mt-1 text-[11px] text-ink-faint">{"{answer}"} becomes the answer, e.g. &quot;{format.replace(/\{answer\}/g, q?.answers[0]?.value ?? "Tuesday")}&quot;</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Type</label>
                <input value={type} onChange={(e) => setType(e.target.value)} className={selectCls} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={create} disabled={busy || chosen.length === 0}>
                {busy ? <><Loader2 className="animate-spin" /> Creating groups…</> : <><Check /> Create {chosen.length} group{chosen.length === 1 ? "" : "s"}</>}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
