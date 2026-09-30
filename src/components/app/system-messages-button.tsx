"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SystemMessagesDialog } from "@/components/app/system-messages-dialog";

/** Button + dialog for editing the app's automatic SMS templates (birthday
 *  wishes, roster reminders, visitor "good to see you again", etc.) - the
 *  same editor already reachable from the Birthdays and Rosters pages, now
 *  also reachable from Communications since that's where people expect to
 *  find "what messages does this app send". */
export function SystemMessagesButton({ saved }: { saved: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <MessageSquare className="size-4" /> Automatic messages
      </Button>
      {open && <SystemMessagesDialog saved={saved} onClose={() => setOpen(false)} />}
    </>
  );
}
