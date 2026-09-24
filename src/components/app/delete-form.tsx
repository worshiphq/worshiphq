"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { flyToBin, notifyRecycleBinChanged } from "@/lib/recycle-bin-events";

/** Form descendant (so it can call useFormStatus) that fires the "fly to bin"
 *  animation + tells the bin to refresh its count once the delete succeeds. */
function FlyToBinOnSuccess({ originRef }: { originRef: React.RefObject<HTMLElement | null> }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    const el = originRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      flyToBin({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
    notifyRecycleBinChanged();
  }, [pending, originRef]);

  return null;
}

/**
 * Reusable delete control: a form bound to a (server) delete action with an
 * optional confirm() prompt. Safe to drop into server components - the bound
 * action is passed as a prop.
 */
export function DeleteForm({
  action,
  confirm: message,
  successMessage = "Deleted",
  label,
  className = "text-ink-faint hover:text-danger",
  undoable = false,
}: {
  action: () => void | Promise<void>;
  confirm?: string;
  successMessage?: string;
  label?: string;
  className?: string;
  /** Set when `action` actually snapshots into the recycle bin before deleting -
   *  plays the fly-to-bin animation and refreshes its count. Leave false for
   *  deletes that aren't (yet) restorable, so the bin never shows a false promise. */
  undoable?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (message && !window.confirm(message)) e.preventDefault();
      }}
    >
      <SubmitButton size="sm" variant="ghost" overlay={false} successMessage={successMessage} className={className}>
        <Trash2 className="size-4" /> {label}
      </SubmitButton>
      {undoable && <FlyToBinOnSuccess originRef={formRef} />}
    </form>
  );
}
