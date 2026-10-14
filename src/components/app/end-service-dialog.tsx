"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Flag, X, Send, MessageSquare, Users, Phone, RotateCcw, CheckCircle2, Loader2, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { endService, reopenService, thankAttendees } from "@/app/actions/attendance";
import Link from "next/link";
import {
  DEFAULT_ATTENDANCE_REPORT,
  ATTENDANCE_REPORT_PLACEHOLDERS,
  renderAttendanceReport,
  parseNumbers,
} from "@/lib/attendance/report";
import { cn } from "@/lib/utils";

interface Counts { adults: number; teens: number; children: number; visitors: number }
/** The optional "thank you for coming" text to every member who checked in. */
export interface ThanksInfo { defaultOn: boolean; recipients: number; requested: boolean; sentCount: number; preview: string }

export function EndServiceButton({
  sessionId, serviceName, date, churchName, counts, endedAt, reportSentTo,
  config, smsBalance, isDemo, thanks,
}: {
  sessionId: string;
  serviceName: string;
  date: string; // ISO
  churchName: string;
  counts: Counts;
  endedAt: string | null;
  reportSentTo: number;
  config: { template: string | null; numbers: string; toAdmins: boolean; toLeaders: boolean; adminCount: number; leaderCount: number };
  smsBalance: number;
  isDemo: boolean;
  thanks: ThanksInfo;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [reopening, startReopen] = useTransition();
  const [thanking, startThank] = useTransition();

  if (endedAt) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1.5 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" /> Service ended
          {reportSentTo > 0 && <span className="text-success/80">· report sent to {reportSentTo}</span>}
        </span>
        {!isDemo && !thanks.requested && thanks.recipients > 0 && (
          <Button
            variant="secondary" size="sm"
            disabled={thanking}
            onClick={() => {
              if (!window.confirm(`Text a thank-you to the ${thanks.recipients} member${thanks.recipients === 1 ? "" : "s"} who came? This uses SMS credits.`)) return;
              startThank(async () => {
                const r = await thankAttendees(sessionId);
                if (r.ok) toast(r.insufficient ? `Sent ${r.sent}. SMS credits ran out; the rest will go when you top up.` : r.remaining > 0 ? `Sent ${r.sent}. The rest are going out over the next hour.` : `Thank-you sent to ${r.sent}.`, r.insufficient ? "error" : "success");
                else toast(r.error, "error");
                router.refresh();
              });
            }}
          >
            {thanking ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <><HeartHandshake className="size-4" /> Thank everyone who came</>}
          </Button>
        )}
        {thanks.requested && thanks.sentCount > 0 && <span className="text-xs text-ink-faint">Thanked {thanks.sentCount}</span>}
        {!isDemo && (
          <Button
            variant="ghost" size="sm" className="text-ink-muted"
            disabled={reopening}
            onClick={() =>
              startReopen(async () => {
                await reopenService(sessionId);
                toast("Service reopened", "info");
                router.refresh();
              })
            }
          >
            {reopening ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reopen
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={isDemo}>
        <Flag className="size-4" /> End service
      </Button>
      {open && (
        <EndServiceDialog
          sessionId={sessionId} serviceName={serviceName} date={date} churchName={churchName}
          counts={counts} config={config} smsBalance={smsBalance} thanks={thanks}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EndServiceDialog({
  sessionId, serviceName, date, churchName, counts, config, smsBalance, thanks, onClose,
}: {
  sessionId: string;
  serviceName: string;
  date: string;
  churchName: string;
  counts: Counts;
  config: { template: string | null; numbers: string; toAdmins: boolean; toLeaders: boolean; adminCount: number; leaderCount: number };
  smsBalance: number;
  thanks: ThanksInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();

  const [toAdmins, setToAdmins] = useState(config.toAdmins);
  const [toLeaders, setToLeaders] = useState(config.toLeaders);
  const [numbers, setNumbers] = useState(config.numbers ?? "");
  const [template, setTemplate] = useState(config.template ?? DEFAULT_ATTENDANCE_REPORT);
  const [thank, setThank] = useState(thanks.defaultOn && thanks.recipients > 0);

  const total = counts.adults + counts.teens + counts.children + counts.visitors;
  const dateLabel = new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const preview = useMemo(
    () => renderAttendanceReport(template, {
      church: churchName, service: serviceName, date: dateLabel,
      total, adults: counts.adults, teens: counts.teens, children: counts.children, visitors: counts.visitors,
    }),
    [template, churchName, serviceName, dateLabel, total, counts],
  );

  // Rough recipient count for the preview (admins/leaders overlap, so this is an
  // upper bound; the server dedupes before sending).
  const extraCount = parseNumbers(numbers).length;
  const approxRecipients =
    (toAdmins ? config.adminCount : 0) + (toLeaders ? config.leaderCount : 0) + extraCount;
  const segments = Math.max(1, Math.ceil(preview.length / 160));
  const thankSegments = Math.max(1, Math.ceil(thanks.preview.length / 160));
  const estCredits = approxRecipients * segments + (thank ? thanks.recipients * thankSegments : 0);
  const lowBalance = estCredits > smsBalance;

  function submit() {
    if (approxRecipients === 0 && !thank) {
      toast("Choose who should get the report (or add a number), or thank the members who came.", "error");
      return;
    }
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("toAdmins", toAdmins ? "true" : "false");
    fd.set("toLeaders", toLeaders ? "true" : "false");
    fd.set("numbers", numbers);
    fd.set("template", template);
    fd.set("thank", thank ? "true" : "false");
    start(async () => {
      const res = await endService(fd);
      if (res?.ok) {
        if (res.insufficient) {
          toast("Service ended, but SMS credits ran out before all messages sent.", "error");
        } else {
          const th = thank ? (res.thanksInsufficient ? ` Thank-you sent to ${res.thanked}; credits ran out for the rest.` : res.thanksLeft > 0 ? ` Thank-you sent to ${res.thanked}; the rest go out over the next hour.` : ` Thank-you sent to ${res.thanked} member${res.thanked === 1 ? "" : "s"}.`) : "";
          toast(`Service ended · report sent to ${res.sent} recipient${res.sent === 1 ? "" : "s"}.${th}`, res.thanksInsufficient ? "error" : "success");
        }
        router.refresh();
        onClose();
      } else {
        toast(res?.error ?? "Couldn't end the service.", "error");
      }
    });
  }

  const chip = "rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted hover:bg-primary/10 hover:text-primary";

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={() => { if (!pending) onClose(); }} />
      <div className="fixed inset-0 z-[61] flex items-start justify-center overflow-y-auto overscroll-contain p-4">
        <div className="my-8 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold">End service</h2>
            </div>
            <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-2"><X className="size-5" /></button>
          </div>

          <p className="text-sm text-ink-muted">
            Closes check-in for <b>{serviceName}</b> and texts this headcount to the people you pick.
          </p>

          {/* Headcount recap */}
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {[
              { label: "Total", value: total, accent: true },
              { label: "Adults", value: counts.adults },
              { label: "Teens", value: counts.teens },
              { label: "Children", value: counts.children },
              { label: "Visitors", value: counts.visitors },
            ].map((c) => (
              <div key={c.label} className={cn("rounded-xl border p-2", c.accent ? "border-primary/40 bg-primary/5" : "border-line bg-base")}>
                <div className="font-display text-lg font-bold">{c.value}</div>
                <div className="text-[10px] text-ink-faint">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Recipients */}
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Users className="size-3.5" /> Who gets the report
            </div>
            <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
              <span>Admins <span className="text-ink-faint">({config.adminCount})</span></span>
              <input type="checkbox" checked={toAdmins} onChange={(e) => setToAdmins(e.target.checked)} className="size-4 accent-primary" />
            </label>
            <label className="mt-2 flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
              <span>Everyone with attendance access <span className="text-ink-faint">({config.leaderCount})</span></span>
              <input type="checkbox" checked={toLeaders} onChange={(e) => setToLeaders(e.target.checked)} className="size-4 accent-primary" />
            </label>
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-muted"><Phone className="size-3.5" /> Extra numbers (for people without a login)</div>
              <Textarea
                value={numbers}
                onChange={(e) => setNumbers(e.target.value)}
                placeholder="0244000000, 0201234567 - one per line or comma-separated"
                className="h-16 text-sm"
              />
            </div>
          </div>

          {/* Editable message */}
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <MessageSquare className="size-3.5" /> Message
            </div>
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} className="h-24 text-sm" />
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-ink-faint">Insert:</span>
              {ATTENDANCE_REPORT_PLACEHOLDERS.map((p) => (
                <button key={p.key} type="button" title={p.hint} className={chip}
                  onClick={() => setTemplate((t) => `${t}{${p.key}}`)}>
                  {`{${p.key}}`}
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-line bg-base p-3 text-sm text-ink-muted">
              <span className="text-[10px] uppercase tracking-wide text-ink-faint">Preview</span>
              <p className="mt-1 whitespace-pre-wrap text-ink">{preview}</p>
            </div>
          </div>

          {/* Thank everyone who came */}
          <div className="mt-5 rounded-xl border border-line p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={thank} onChange={(e) => setThank(e.target.checked)} disabled={thanks.recipients === 0} className="mt-0.5 size-4 accent-primary" />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-semibold"><HeartHandshake className="size-4 text-primary" /> Thank everyone who came</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {thanks.recipients === 0
                    ? "Nobody who checked in has a phone number on file, so there is nobody to text."
                    : `A warm text to the ${thanks.recipients} member${thanks.recipients === 1 ? "" : "s"} who checked in and have a phone number. Nobody is texted twice in a day.`}
                </span>
              </span>
            </label>
            {thank && thanks.recipients > 0 && (
              <div className="mt-2 rounded-lg border border-dashed border-line bg-base p-2.5 text-xs text-ink-muted">
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">Each member gets</span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{thanks.preview}</p>
                <Link href="/app/messages?focus=service_thanks" className="mt-1 inline-block font-medium text-primary hover:underline">Edit the wording</Link>
              </div>
            )}
          </div>

          {/* Cost + actions */}
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-ink-faint">
              ≈ {estCredits} credit{estCredits === 1 ? "" : "s"} to {approxRecipients} recipient{approxRecipients === 1 ? "" : "s"}
            </span>
            <span className={cn(lowBalance ? "font-medium text-danger" : "text-ink-faint")}>Balance: {smsBalance}</span>
          </div>
          {lowBalance && (
            <p className="mt-1 text-xs text-danger">Not enough credits for everyone - some messages may not send.</p>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button className="flex-1" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {pending ? "Ending…" : thank ? "End, send report & thank" : "End & send report"}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
