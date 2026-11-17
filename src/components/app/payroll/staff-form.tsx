"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserRoundSearch, UserPlus, ChevronLeft } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useFeedback } from "@/components/ui/feedback";
import { SearchSelect, type SearchOption } from "@/components/app/search-select";
import { searchPickerPeople } from "@/app/actions/lists";
import { saveStaff } from "@/app/actions/staff";
import { EMPLOYMENT_TYPES } from "@/lib/payroll/defaults";
import { field } from "./ui";

export interface StaffFormValues {
  id?: string; personId?: string | null; firstName?: string; lastName?: string; otherNames?: string | null; phone?: string | null; email?: string | null;
  jobTitle?: string | null; departmentId?: string | null; employmentType?: string; startDate?: string | null; reportsToUserId?: string | null;
  emergencyName?: string | null; emergencyPhone?: string | null; emergencyRelation?: string | null; notes?: string | null;
}

/**
 * Add or edit a staff member. Adding starts with "Is this person already in your church records?" so a member's
 * details are copied rather than typed again.
 */
export function StaffFormModal({ open, onClose, initial, departments, team }: {
  open: boolean; onClose: () => void; initial?: StaffFormValues;
  departments: { id: string; name: string }[]; team: { id: string; name: string }[];
}) {
  const editing = !!initial?.id;
  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const [person, setPerson] = useState<SearchOption | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();
  const v = initial ?? {};

  const submit = (fd: FormData) => {
    if (person) fd.set("personId", person.value);
    start(async () => {
      const r = await saveStaff(fd);
      if (!r.ok) { toast(r.error, "error"); return; }
      toast(r.message ?? "Saved", "success");
      onClose();
      if (!editing && r.id) router.push(`/app/staff/${r.id}`);
      else router.refresh();
    });
  };

  const [first, ...rest] = (person?.label ?? "").split(" ");
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit staff details" : "Add staff"} description={step === 1 ? "Is this person already in your church records?" : "Their job and contact details. Pay is set up on their profile."} wide={step === 2}>
      {step === 1 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><UserRoundSearch className="size-4 text-primary" /> Yes, find them</div>
            <SearchSelect options={person ? [person] : []} value={person?.value ?? ""} onChange={(_, o) => setPerson(o ?? null)} placeholder="Type a member's name or phone" search={(q) => searchPickerPeople("staff", q, { who: "notVisitor" })} />
            <Button className="mt-3 w-full" disabled={!person} onClick={() => setStep(2)}>Continue with {person?.label ?? "this person"}</Button>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => { setPerson(null); setStep(2); }}><UserPlus className="size-4" /> No, enter their details</Button>
        </div>
      ) : (
        <form action={submit} className="space-y-5">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          {!editing && (
            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"><ChevronLeft className="size-3.5" /> Back</button>
          )}
          {person && <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-ink-muted">Linked to the member record of <strong className="text-ink">{person.label}</strong>. Empty fields are filled from it.</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="sf-first">First name</Label><Input id="sf-first" name="firstName" defaultValue={v.firstName ?? first ?? ""} required={!person} /></div>
            <div><Label htmlFor="sf-last">Last name</Label><Input id="sf-last" name="lastName" defaultValue={v.lastName ?? rest.join(" ")} required={!person} /></div>
            <div><Label htmlFor="sf-other">Other names</Label><Input id="sf-other" name="otherNames" defaultValue={v.otherNames ?? ""} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="sf-job">Job title</Label><Input id="sf-job" name="jobTitle" placeholder="e.g. Church administrator" defaultValue={v.jobTitle ?? ""} /></div>
            <div>
              <Label htmlFor="sf-dept">Department</Label>
              <select id="sf-dept" name="departmentId" defaultValue={v.departmentId ?? ""} className={field}>
                <option value="">None</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="sf-type">Employment</Label>
              <select id="sf-type" name="employmentType" defaultValue={v.employmentType ?? "full_time"} className={field}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="sf-start">Start date</Label><Input id="sf-start" name="startDate" type="date" defaultValue={v.startDate?.slice(0, 10) ?? ""} /></div>
            <div><Label htmlFor="sf-phone">Mobile number</Label><Input id="sf-phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone ?? ""} /></div>
            <div><Label htmlFor="sf-email">Email</Label><Input id="sf-email" name="email" type="email" defaultValue={v.email ?? ""} /></div>
          </div>
          <div>
            <Label htmlFor="sf-reports">Reports to (approves their leave)</Label>
            <select id="sf-reports" name="reportsToUserId" defaultValue={v.reportsToUserId ?? ""} className={field}>
              <option value="">Nobody in particular</option>
              {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">Emergency contact</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label htmlFor="sf-en">Name</Label><Input id="sf-en" name="emergencyName" defaultValue={v.emergencyName ?? ""} /></div>
              <div><Label htmlFor="sf-ep">Phone</Label><Input id="sf-ep" name="emergencyPhone" type="tel" inputMode="tel" defaultValue={v.emergencyPhone ?? ""} /></div>
              <div><Label htmlFor="sf-er">Relationship</Label><Input id="sf-er" name="emergencyRelation" placeholder="e.g. Husband" defaultValue={v.emergencyRelation ?? ""} /></div>
            </div>
          </fieldset>
          <div><Label htmlFor="sf-notes">Notes</Label><Textarea id="sf-notes" name="notes" className="min-h-16" defaultValue={v.notes ?? ""} /></div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={pending}>{pending ? <><Spinner size="sm" /> Saving…</> : editing ? "Save changes" : "Add to staff"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
