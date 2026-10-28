"use client";

import { useActionState, useRef, useEffect, useTransition } from "react";
import { UserPlus, Check, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { addRegistration, setRegistrationCheckedIn, removeRegistration, type AttendeeResult } from "@/app/actions/events";

const input =
  "flex h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30";

/** Add someone to the event by hand. Shows a clear message if the event is full. */
export function AddAttendeeForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState<AttendeeResult, FormData>(addRegistration.bind(null, eventId), null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="name" required placeholder="Full name" className={input} aria-label="Full name" />
        <input name="phone" placeholder="Phone (optional)" className={input} aria-label="Phone" />
        <input name="email" type="email" placeholder="Email (optional)" className={input} aria-label="Email" />
      </div>
      {state && !state.ok && state.error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{state.error}</div>
      )}
      <SubmitButton size="sm" pendingLabel="Adding…" successMessage="Added to the event"><UserPlus className="size-4" /> Add person</SubmitButton>
    </form>
  );
}

/** Check-in tick and remove button for one attendee. */
export function AttendeeActions({ id, name, checkedIn, canEdit }: { id: string; name: string; checkedIn: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  if (!canEdit) return <span className="text-xs text-ink-faint">{checkedIn ? "Checked in" : "-"}</span>;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={checkedIn ? "secondary" : "primary"}
        disabled={pending}
        onClick={() => start(async () => { await setRegistrationCheckedIn(id, !checkedIn); })}
      >
        {pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : checkedIn ? <><Check className="size-4" /> Checked in</> : "Check in"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={`Remove ${name}`}
        title="Remove from this event"
        onClick={() => { if (confirm(`Remove ${name} from this event?`)) start(async () => { await removeRegistration(id); }); }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
