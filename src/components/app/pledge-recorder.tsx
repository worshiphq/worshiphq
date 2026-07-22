"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X, Check, Phone, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import { createPledge } from "@/app/actions/pledges";
import { cn } from "@/lib/utils";

export interface MemberOption {
  id: string;
  name: string;
  phone: string | null;
  memberId: string | null;
}

export function PledgeRecorder({
  members,
  campaigns,
  harvests,
  disabled,
}: {
  members: MemberOption[];
  campaigns: { id: string; name: string }[];
  harvests: { id: string; label: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"member" | "visitor">("member");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<MemberOption | null>(null);
  const [pending, start] = useTransition();
  const { toast } = useFeedback();
  const router = useRouter();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter((m) => m.name.toLowerCase().includes(q) || m.phone?.includes(q) || m.memberId?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, members]);

  function close() {
    setOpen(false);
    setPicked(null);
    setQuery("");
    setTab("member");
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="size-4" /> Record pledge
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
              <h2 className="font-display text-lg font-semibold">Record pledge</h2>
              <button onClick={close} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>

            <form
              className="space-y-4 p-5"
              action={(fd) =>
                start(async () => {
                  fd.set("donorType", tab);
                  if (tab === "member") {
                    if (!picked) return toast("Choose a member first", "error");
                    fd.set("personId", picked.id);
                  }
                  const res = await createPledge(fd);
                  if (!res?.ok) return toast(res?.error ?? "Couldn't save pledge", "error");
                  toast("Pledge recorded", "success");
                  close();
                  router.refresh();
                })
              }
            >
              {/* Member / visitor switch */}
              <div className="flex rounded-xl border border-line p-1 text-sm font-medium">
                {(["member", "visitor"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn("flex-1 rounded-lg py-2 capitalize", tab === t ? "bg-primary text-white" : "text-ink-muted")}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "member" ? (
                <div>
                  <Label>Find member</Label>
                  {picked ? (
                    <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-semibold">{picked.name}</div>
                        <div className="flex items-center gap-1 text-xs text-ink-muted">
                          <Phone className="size-3" />
                          {picked.phone ?? "No phone on file — no SMS will be sent"}
                        </div>
                      </div>
                      <button type="button" onClick={() => setPicked(null)} className="text-xs font-medium text-primary hover:underline">
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
                        <Input
                          placeholder="Type a name, member ID or phone…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          className="pl-10"
                          autoFocus
                        />
                      </div>
                      <div className="mt-2 max-h-56 divide-y divide-line-soft overflow-y-auto rounded-xl border border-line">
                        {matches.length === 0 ? (
                          <p className="p-3 text-sm text-ink-faint">No members match.</p>
                        ) : (
                          matches.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setPicked(m)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-2"
                            >
                              <span>
                                <span className="block text-sm font-medium">{m.name}</span>
                                <span className="block text-xs text-ink-faint">{m.phone ?? "No phone"}{m.memberId ? ` · ${m.memberId}` : ""}</span>
                              </span>
                              <Check className="size-4 text-ink-faint" />
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Visitor name</Label>
                    <Input name="donorName" placeholder="Full name" required />
                  </div>
                  <div>
                    <Label>Phone (for the SMS confirmation)</Label>
                    <Input name="donorPhone" type="tel" placeholder="024 000 0000" />
                  </div>
                </div>
              )}

              <div>
                <Label>Amount pledged (GHS)</Label>
                <Input name="amount" type="number" step="0.01" min="0" placeholder="500" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Campaign</Label>
                  <select name="campaignId" defaultValue="" className="h-10 w-full rounded-xl border border-line bg-base px-2 text-sm">
                    <option value="">— None —</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Harvest</Label>
                  <select name="harvestId" defaultValue="" className="h-10 w-full rounded-xl border border-line bg-base px-2 text-sm">
                    <option value="">— None —</option>
                    {harvests.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <Label>Due date</Label>
                <Input name="dueAt" type="date" />
                <p className="mt-1 text-xs text-ink-faint">Reminders go out automatically on your set schedule.</p>
              </div>

              <div>
                <Label>Notes</Label>
                <textarea
                  name="notes"
                  rows={2}
                  className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input type="checkbox" name="notify" defaultChecked value="on" className="size-4 rounded border-line accent-primary" />
                Text them a confirmation now
              </label>

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Saving…</> : <><UserRound className="mr-2 size-4" /> Record pledge</>}
              </Button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
