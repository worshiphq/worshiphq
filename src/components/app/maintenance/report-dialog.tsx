"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { reportProblem } from "@/app/actions/maintenance";
import { searchAssets } from "@/app/actions/lists";
import { SearchSelect } from "@/components/app/search-select";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { PhotoInput } from "@/components/app/shared/photo-input";
import { Sheet, BusyButton, FormError, F, Select, ChipChoice } from "@/components/app/shared/kit";

export function ReportDialog({ facilities, canSearchAssets, onClose }: { facilities: { id: string; name: string }[]; canSearchAssets: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [priority, setPriority] = useState("normal");
  const [room, setRoom] = useState("");
  const [asset, setAsset] = useState("");

  const submit = (fd: FormData) => {
    setError("");
    fd.set("priority", priority);
    fd.set("facilityId", room === "text" ? "" : room);
    fd.set("assetId", asset);
    start(async () => {
      const r = await reportProblem(fd);
      if (r.ok) { toast("Thank you. The problem has been reported.", "success"); router.refresh(); onClose(); }
      else setError(r.error ?? "That did not send.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} title="Report a problem" description="A leaking roof, a broken fan, a dead mic. The people who fix things will see it.">
      <form action={submit} className="space-y-4">
        <F label="What is wrong" htmlFor="rp-t"><Input id="rp-t" name="title" placeholder="e.g. Ceiling fan in the main hall not working" required autoFocus /></F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Where" htmlFor="rp-r">
            <Select id="rp-r" value={room} onChange={setRoom} options={[{ value: "", label: "Choose a room" }, ...facilities.map((f) => ({ value: f.id, label: f.name })), { value: "text", label: "Somewhere else" }]} />
          </F>
          {(room === "text" || facilities.length === 0) && <F label="Place" htmlFor="rp-l"><Input id="rp-l" name="location" placeholder="e.g. Back gate" /></F>}
        </div>
        {canSearchAssets && (
          <F label="Which item (optional)">
            <SearchSelect
              value={asset}
              onChange={(v) => setAsset(v)}
              options={[{ value: "", label: "Not a listed item" }]}
              placeholder="Search the asset register…"
              search={async (q) => (await searchAssets(q, {}, 1)).rows.map((a) => ({ value: a.id, label: a.name, hint: a.tagCode ?? undefined }))}
            />
          </F>
        )}
        <F label="How urgent"><ChipChoice value={priority} onChange={setPriority} options={[{ value: "low", label: "Can wait" }, { value: "normal", label: "Normal" }, { value: "urgent", label: "Urgent" }]} /></F>
        <F label="More detail (optional)" htmlFor="rp-d"><Textarea id="rp-d" name="description" rows={2} className="min-h-16" /></F>
        <PhotoInput name="photo" label="Photo (optional)" icon={Camera} wide />
        <FormError error={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} busyLabel="Sending…" className="flex-1">Report it</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
