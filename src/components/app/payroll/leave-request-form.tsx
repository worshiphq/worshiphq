"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { requestLeave } from "@/app/actions/leave";
import { BusyButton } from "./busy-button";
import { field } from "./ui";

/** Ask for leave (My pay) or record it for someone (Staff, Leave) when `staff` is given. */
export function LeaveRequestForm({ types, staff, onDone }: { types: { id: string; name: string; paid: boolean }[]; staff?: { id: string; name: string }[]; onDone?: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [staffId, setStaffId] = useState(staff?.[0]?.id ?? "");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      {staff && (
        <div><Label htmlFor="lr-s">Staff member</Label><select id="lr-s" className={field} value={staffId} onChange={(e) => setStaffId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      )}
      <div><Label htmlFor="lr-t">Type of leave</Label><select id="lr-t" className={field} value={typeId} onChange={(e) => setTypeId(e.target.value)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? "" : " (unpaid)"}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="lr-from">From</Label><Input id="lr-from" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></div>
        <div><Label htmlFor="lr-to">To</Label><Input id="lr-to" type="date" value={half ? start : end} disabled={half} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} /> Half a day</label>
      <div><Label htmlFor="lr-r">Reason (optional)</Label><Input id="lr-r" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <BusyButton className="w-full" disabled={!typeId || (!!staff && !staffId)} pendingLabel={staff ? "Recording…" : "Sending request…"}
        run={() => requestLeave({ staffId: staff ? staffId : undefined, leaveTypeId: typeId, startDate: start, endDate: half ? start : end, halfDay: half, reason })}
        onDone={(r) => { if (r.ok) { setReason(""); onDone?.(); } }}>
        {staff ? "Record leave" : "Ask for leave"}
      </BusyButton>
    </div>
  );
}
