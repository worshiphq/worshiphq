"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wrench, MapPin, UserRound, CheckCircle2, Trash2, Download } from "lucide-react";
import { updateMaintenanceRequest, completeMaintenanceRequest, deleteMaintenanceRequest } from "@/app/actions/maintenance";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/segmented";
import { Spinner } from "@/components/ui/spinner";
import { PhotoLightbox } from "@/components/ui/photo-lightbox";
import { PageHeader } from "@/components/app/page-header";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { ReportDialog } from "@/components/app/maintenance/report-dialog";
import { ReceiptInput } from "@/components/app/expenses/receipt-input";
import { PostCostBox, type Account } from "@/components/app/vehicles/service-form";
import { Dot, Sheet, BusyButton, FormError, F, Select, money, fmtDate, ago, ymdOf, type Tone } from "@/components/app/shared/kit";
import type { RequestRow } from "@/lib/data/maintenance";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "open", label: "Open" },
  { key: "assigned", label: "Assigned" },
  { key: "in-progress", label: "In progress" },
  { key: "done", label: "Done (30 days)" },
] as const;
const PRIORITY: Record<string, { label: string; tone: Tone }> = { low: { label: "Can wait", tone: "muted" }, normal: { label: "Normal", tone: "info" }, urgent: { label: "Urgent", tone: "danger" } };

export function MaintenanceClient({ rows, counts, facilities, team, accounts, seesAll, canWrite, canDelete, canPostExpenses, canSearchAssets }: {
  rows: RequestRow[]; counts: Record<string, number>; facilities: { id: string; name: string }[]; team: { id: string; name: string; hasPhone: boolean }[];
  accounts: Account[]; seesAll: boolean; canWrite: boolean; canDelete: boolean; canPostExpenses: boolean; canSearchAssets: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<string>("open");
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Maintenance" description={seesAll ? `${counts.open + counts.assigned + counts["in-progress"]} open job${counts.open + counts.assigned + counts["in-progress"] === 1 ? "" : "s"}${counts.urgent ? `, ${counts.urgent} urgent` : ""}` : "Problems you reported and how they are going."}>
        {seesAll && <a href={`/api/export/maintenance?format=xlsx`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}><Download /> Export</a>}
        <Button size="sm" onClick={() => setReporting(true)}><Plus /> Report a problem</Button>
      </PageHeader>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Wrench className="mx-auto size-10 text-ink-faint" />
          <h2 className="mt-3 font-display text-lg font-bold">Nothing to fix right now</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">When something breaks, anyone on the team can report it here with a photo. It gets assigned, fixed, and the cost recorded.</p>
          <Button className="mt-4" onClick={() => setReporting(true)}><Plus /> Report a problem</Button>
        </Card>
      ) : (
        <>
          <div className="mb-3 md:hidden">
            <Segmented value={mobileTab} onChange={setMobileTab} label="Status" options={COLUMNS.map((c) => ({ value: c.key, label: `${c.label.replace(" (30 days)", "")} ${counts[c.key] ?? 0}` }))} />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {COLUMNS.map((c) => {
              const items = rows.filter((r) => r.status === c.key);
              return (
                <section key={c.key} className={cn("min-w-0", mobileTab !== c.key && "hidden md:block")}>
                  <h2 className="mb-2 hidden items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint md:flex">
                    {c.label} <span className="tabular-nums">{items.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {items.length === 0 && <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-faint">Nothing here</p>}
                    {items.map((r) => <JobCard key={r.id} r={r} canWrite={canWrite} onOpen={() => setOpenId(r.id)} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {reporting && <ReportDialog facilities={facilities} canSearchAssets={canSearchAssets} onClose={() => setReporting(false)} />}
      {open && <JobDrawer r={open} team={team} accounts={accounts} canWrite={canWrite} canDelete={canDelete} canPostExpenses={canPostExpenses} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function JobCard({ r, canWrite, onOpen }: { r: RequestRow; canWrite: boolean; onOpen: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const pr = PRIORITY[r.priority] ?? PRIORITY.normal;
  const move = (status: string) => {
    if (status === "done") { onOpen(); return; }
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("status", status);
    start(async () => { const x = await updateMaintenanceRequest(fd); if (x.ok) router.refresh(); else toast(x.error ?? "Could not move it.", "error"); });
  };
  return (
    <Card className={cn("p-0 transition-opacity", pending && "opacity-60", r.priority === "urgent" && r.status !== "done" && "border-danger/40")}>
      <button onClick={onOpen} className="flex w-full gap-3 p-3 text-left">
        {r.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photoUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium">{r.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            {r.place && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {r.place}</span>}
            <span>{ago(r.createdAt)}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Dot tone={pr.tone}>{pr.label}</Dot>
            {r.assignee && <span className="inline-flex items-center gap-1 text-xs text-ink-muted"><UserRound className="size-3" /> {r.assignee}</span>}
          </span>
        </span>
      </button>
      {canWrite && r.status !== "done" && (
        <div className="flex items-center gap-2 border-t border-line-soft px-3 py-2">
          <select aria-label="Move to" value={r.status} onChange={(e) => move(e.target.value)} disabled={pending} className="h-8 flex-1 rounded-lg border border-line bg-surface px-2 text-xs">
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.key === "done" ? "Done…" : c.label}</option>)}
          </select>
          {pending && <Spinner size="sm" className="text-primary" />}
        </div>
      )}
    </Card>
  );
}

function JobDrawer({ r, team, accounts, canWrite, canDelete, canPostExpenses, onClose }: {
  r: RequestRow; team: { id: string; name: string; hasPhone: boolean }[]; accounts: Account[]; canWrite: boolean; canDelete: boolean; canPostExpenses: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [saving, startSave] = useTransition();
  const [finishing, startFinish] = useTransition();
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState("");
  const [who, setWho] = useState(r.assigneeUserId ?? (r.assignee ? "other" : ""));
  const [record, setRecord] = useState(true);
  const [zoom, setZoom] = useState(false);
  const busy = saving || finishing || removing;
  const picked = team.find((t) => t.id === who);

  const save = (fd: FormData) => {
    setError("");
    fd.set("id", r.id);
    fd.set("assigneeUserId", who === "other" ? "" : who);
    if (who !== "other") fd.set("assigneeName", "");
    startSave(async () => {
      const x = await updateMaintenanceRequest(fd);
      if (x.ok) { toast("Saved", "success"); router.refresh(); } else setError(x.error ?? "That did not save.");
    });
  };
  const finish = (fd: FormData) => {
    setError("");
    fd.set("id", r.id);
    if (!record) fd.delete("record");
    startFinish(async () => {
      const x = await completeMaintenanceRequest(fd);
      if (x.ok) { toast(x.posted === "expense" ? "Done, and the cost is in Expenses" : x.posted === "request" ? "Done, and the cost was sent to finance" : "Marked as done", "success"); router.refresh(); onClose(); }
      else setError(x.error ?? "That did not save.");
    });
  };
  const remove = () => {
    if (!confirmBinDelete("Delete this request?")) return;
    const fd = new FormData();
    fd.set("id", r.id);
    startRemove(async () => {
      const x = await deleteMaintenanceRequest(fd);
      if (x.ok) { binDeleted(); router.refresh(); onClose(); } else setError(x.error ?? "Could not delete.");
    });
  };
  const pr = PRIORITY[r.priority] ?? PRIORITY.normal;

  return (
    <Sheet open onClose={onClose} busy={busy} wide title={r.title} description={[r.place, r.assetName].filter(Boolean).join(" · ") || undefined}>
      <div className="space-y-5">
        <div className="flex gap-4">
          {r.photoUrl && (
            <button onClick={() => setZoom(true)} className="shrink-0" aria-label="View photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.photoUrl} alt="" className="h-24 w-32 rounded-xl object-cover" />
            </button>
          )}
          <div className="min-w-0 space-y-1 text-sm">
            <Dot tone={pr.tone}>{pr.label}</Dot>
            {r.description && <p className="whitespace-pre-line text-ink-muted">{r.description}</p>}
            <ol className="mt-2 space-y-0.5 text-xs text-ink-faint">
              <li>Reported {fmtDate(r.createdAt)}{r.reportedByName ? ` by ${r.reportedByName}` : ""}</li>
              {r.assignee && <li>Assigned to {r.assignee}{r.dueDate ? `, due ${fmtDate(r.dueDate, false)}` : ""}</li>}
              {r.resolvedAt && <li>Done {fmtDate(r.resolvedAt)}{r.actualCost ? ` for ${money(r.actualCost, true)}` : ""}{r.expenseId ? " (in Expenses)" : ""}</li>}
            </ol>
            {r.resolution && <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-ink-muted">{r.resolution}</p>}
          </div>
        </div>

        {canWrite && r.status !== "done" && (
          <>
            <form action={save} className="space-y-3 border-t border-line-soft pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Who fixes it</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="Assign to" htmlFor="jd-a"><Select id="jd-a" value={who} onChange={setWho} options={[{ value: "", label: "Nobody yet" }, ...team.map((t) => ({ value: t.id, label: t.name })), { value: "other", label: "An artisan or company" }]} /></F>
                {who === "other" && <F label="Their name" htmlFor="jd-n"><Input id="jd-n" name="assigneeName" defaultValue={r.assigneeUserId ? "" : r.assignee ?? ""} placeholder="e.g. Kwesi the electrician" /></F>}
                <F label="Fix by" htmlFor="jd-d"><Input id="jd-d" name="dueDate" type="date" defaultValue={ymdOf(r.dueDate)} /></F>
                <F label="Estimated cost (₵)" htmlFor="jd-e"><Input id="jd-e" name="estimatedCost" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={r.estimatedCost ?? ""} /></F>
                <F label="Urgency" htmlFor="jd-p"><Select id="jd-p" name="priority" defaultValue={r.priority} options={[{ value: "low", label: "Can wait" }, { value: "normal", label: "Normal" }, { value: "urgent", label: "Urgent" }]} /></F>
                <F label="Status" htmlFor="jd-s"><Select id="jd-s" name="status" defaultValue={r.status} options={COLUMNS.filter((c) => c.key !== "done").map((c) => ({ value: c.key, label: c.label }))} /></F>
              </div>
              {picked?.hasPhone && who !== r.assigneeUserId && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="textThem" value="1" className="size-4 accent-[var(--color-primary)]" /> Text them too (uses 1 SMS credit)</label>
              )}
              <BusyButton busy={saving} variant="secondary" className="w-full sm:w-auto">Save</BusyButton>
            </form>

            <form action={finish} className="space-y-3 border-t border-line-soft pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Mark as done</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <F label="What it cost (₵)" htmlFor="jd-c"><Input id="jd-c" name="actualCost" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={r.estimatedCost ?? ""} className="tabular-nums" /></F>
                <F label="What was done" htmlFor="jd-r"><Textarea id="jd-r" name="resolution" rows={2} className="min-h-11" /></F>
              </div>
              <ReceiptInput />
              <PostCostBox canPostExpenses={canPostExpenses} accounts={accounts} checked={record} onChange={setRecord} />
              <BusyButton busy={finishing} className="w-full sm:w-auto"><CheckCircle2 /> Mark as done</BusyButton>
            </form>
          </>
        )}

        <FormError error={error} />
        {canDelete && (
          <div className="border-t border-line-soft pt-3">
            <BusyButton type="button" variant="ghost" size="sm" busy={removing} busyLabel="Deleting…" onClick={remove} className="text-danger"><Trash2 /> Delete request</BusyButton>
          </div>
        )}
      </div>
      {zoom && r.photoUrl && <PhotoLightbox src={r.photoUrl} alt={r.title} onClose={() => setZoom(false)} />}
    </Sheet>
  );
}
