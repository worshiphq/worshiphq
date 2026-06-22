"use client";

import { useState, useTransition } from "react";
import { Trash2, ChevronDown, ChevronRight, Plus, Calendar, User, Clock, Loader2 } from "lucide-react";
import { deleteRoster, deleteSlot } from "@/app/actions/rosters";
import { ActionDialog, Field } from "@/components/app/action-dialog";
import { useFeedback } from "@/components/ui/feedback";
import { formatDate, cn } from "@/lib/utils";

interface Slot {
  id: string;
  role: string;
  date: string;
  shift: string;
  status: string;
  memberName: string;
  personId: string | null;
}
interface Roster {
  id: string;
  name: string;
  ministry: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  slots: Slot[];
}

const SHIFT_LABEL: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  "full-day": "Full day",
};

const STATUS_STYLE: Record<string, string> = {
  assigned: "bg-brand/10 text-brand",
  confirmed: "bg-success/10 text-success",
  swapped: "bg-gold/10 text-gold",
  absent: "bg-danger/10 text-danger",
};

export function RostersClient({
  rosters,
  members,
  addSlotAction,
  isDemo,
}: {
  rosters: Roster[];
  members: { label: string; value: string }[];
  addSlotAction: (fd: FormData) => Promise<void>;
  isDemo: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const { toast } = useFeedback();

  function toggle(id: string) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }

  const totalSlots = rosters.reduce((s, r) => s + r.slots.length, 0);
  const assignedSlots = rosters.reduce((s, r) => s + r.slots.filter((sl) => sl.personId).length, 0);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold">{rosters.length}</div>
          <div className="text-xs text-ink-muted">Rosters</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-brand">{totalSlots}</div>
          <div className="text-xs text-ink-muted">Total slots</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3 text-center">
          <div className="text-2xl font-bold text-success">{assignedSlots}</div>
          <div className="text-xs text-ink-muted">Assigned</div>
        </div>
      </div>

      {rosters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-ink-faint">
          No rosters created yet. Use the button above to schedule volunteers.
        </div>
      ) : (
        <div className="grid gap-3">
          {rosters.map((r) => {
            const open = expanded[r.id] ?? false;
            const isPast = new Date(r.endDate) < new Date();
            return (
              <div key={r.id} className={cn("rounded-2xl border border-line bg-surface", isPast && "opacity-60")}>
                <button onClick={() => toggle(r.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  {open ? <ChevronDown className="size-4 text-ink-faint" /> : <ChevronRight className="size-4 text-ink-faint" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.name}</span>
                      {r.ministry && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{r.ministry}</span>}
                      {isPast && <span className="text-[11px] text-ink-faint">(past)</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
                      <span>{formatDate(r.startDate)} – {formatDate(r.endDate)}</span>
                      <span>{r.slots.length} slots</span>
                    </div>
                  </div>
                  <form action={(fd) => start(async () => { fd.set("id", r.id); await deleteRoster(fd); toast("Roster deleted", "info"); })} onClick={(e) => e.stopPropagation()}>
                    <button type="submit" disabled={pending} className="grid size-7 place-items-center rounded-lg text-ink-faint hover:bg-danger/10 hover:text-danger disabled:pointer-events-none">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </form>
                </button>

                {open && (
                  <div className="border-t border-line p-4">
                    {r.slots.length === 0 ? (
                      <p className="mb-3 text-sm text-ink-faint">No volunteers scheduled yet.</p>
                    ) : (
                      <div className="mb-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-line text-left text-xs text-ink-faint">
                              <th className="pb-2 pr-3">Date</th>
                              <th className="pb-2 pr-3">Shift</th>
                              <th className="pb-2 pr-3">Role</th>
                              <th className="pb-2 pr-3">Volunteer</th>
                              <th className="pb-2 pr-3">Status</th>
                              <th className="pb-2 w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {r.slots.map((slot) => (
                              <tr key={slot.id} className="border-b border-line/50">
                                <td className="py-2 pr-3">{formatDate(slot.date)}</td>
                                <td className="py-2 pr-3 text-ink-muted">{SHIFT_LABEL[slot.shift] ?? slot.shift}</td>
                                <td className="py-2 pr-3 font-medium">{slot.role}</td>
                                <td className="py-2 pr-3">{slot.memberName}</td>
                                <td className="py-2 pr-3">
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[slot.status] ?? STATUS_STYLE.assigned}`}>{slot.status}</span>
                                </td>
                                <td className="py-2">
                                  <form action={(fd) => start(async () => { fd.set("id", slot.id); await deleteSlot(fd); toast("Slot removed", "info"); })}>
                                    <button type="submit" disabled={pending} className="grid size-6 place-items-center rounded text-ink-faint hover:text-danger disabled:pointer-events-none">
                                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                                    </button>
                                  </form>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <ActionDialog
                      triggerLabel="Add volunteer"
                      triggerIcon={<Plus />}
                                            title="Schedule volunteer"
                      description={`Add a volunteer to "${r.name}"`}
                      submitLabel="Add"
                      action={addSlotAction}
                      disabled={isDemo}
                    >
                      <input type="hidden" name="rosterId" value={r.id} />
                      <Field label="Volunteer" name="personId" type="select" options={members} />
                      <Field label="Role" name="role" placeholder="e.g. Usher, Sound tech, Singer" required />
                      <Field label="Date" name="date" type="date" required />
                      <Field label="Shift" name="shift" type="select" options={[
                        { label: "Morning", value: "morning" },
                        { label: "Afternoon", value: "afternoon" },
                        { label: "Evening", value: "evening" },
                        { label: "Full day", value: "full-day" },
                      ]} />
                    </ActionDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
