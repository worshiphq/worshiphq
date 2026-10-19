"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanFace, Fingerprint, Hand, Plus, Wifi, WifiOff, Trash2, Copy, Check, Loader2, Users, Webhook, Usb, Radio, X, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { addDevice, updateDevice, deleteDevice, sendMembersToDevice, getDevices, type DevicesData, type DeviceRow } from "@/app/actions/devices";
import { cn } from "@/lib/utils";

const MODE_META: Record<string, { label: string; icon: typeof Fingerprint }> = {
  fingerprint: { label: "Fingerprint", icon: Fingerprint },
  face: { label: "Face", icon: ScanFace },
  palm: { label: "Palm", icon: Hand },
};
const RESULT_TEXT: Record<string, { text: string; tone: string }> = {
  checked_in: { text: "Checked in", tone: "text-success" },
  already_in: { text: "Already in", tone: "text-ink-muted" },
  unknown_id: { text: "ID not matched to a member", tone: "text-danger" },
  too_old: { text: "Too old, ignored", tone: "text-ink-faint" },
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

function CopyBox({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
      <code className="min-w-0 flex-1 break-all text-xs">{value}</code>
      <button type="button" className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-surface hover:text-ink" title="Copy"
        onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** Face, palm and fingerprint devices: what works, the devices a church has added, and what they have been scanning. */
export function DevicesClient({ data: initial }: { data: DevicesData }) {
  const router = useRouter();
  // While the page is open we refresh just the device list (a small request), never the whole page.
  const [polled, setPolled] = useState<{ base: DevicesData; fresh: DevicesData } | null>(null);
  const data = polled && polled.base === initial ? polled.fresh : initial;
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<DeviceRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  function refreshNow() {
    setRefreshing(true);
    getDevices().then((fresh) => setPolled({ base: initial, fresh })).catch(() => toast("Could not refresh. Try again.", "error")).finally(() => setRefreshing(false));
  }

  // Keep "online" and the recent scans fresh while the page is open, once a minute and only while it is on screen.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      getDevices().then((fresh) => setPolled({ base: initial, fresh })).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, [initial]);

  const can = data.canManage && data.planOk;
  const openDevice = open ? data.devices.find((d) => d.id === open.id) ?? null : null;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok?: (r: Record<string, unknown>) => string, after?: () => void) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) { toast(String(r.error ?? "Something went wrong."), "error"); return; }
      if (ok) toast(ok(r), "success");
      after?.();
      router.refresh();
    } catch (e) { toast((e as Error).message || "Something went wrong.", "error"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader title="Biometric devices" description="Check people in with a face, palm or fingerprint scan. Add the devices your church uses and watch the scans come in.">
        <Button size="sm" variant="secondary" disabled={refreshing} onClick={refreshNow}>
          {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
        </Button>
        <Button size="sm" onClick={() => setAdding(true)} disabled={!can}><Plus /> Add a device</Button>
      </PageHeader>

      {!data.planOk && <Card className="mb-5 border-warning/40 bg-warning/5 p-4 text-sm">Biometric check-in is part of the Max plan. You can look around here, and add devices once your church is on Max.</Card>}

      {/* What works */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2"><ScanFace className="size-5 text-primary" /><Hand className="size-5 text-primary" /><Fingerprint className="size-5 text-primary" /></div>
          <h3 className="mt-3 font-semibold">Face, palm and fingerprint terminals</h3>
          <p className="mt-1 text-sm text-ink-muted">ZKTeco and compatible terminals (SpeedFace, ProFace, MB and iClock families, and many rebranded ones). They connect to WorshipHQ by themselves through their built-in cloud server setting. No computer to leave switched on.</p>
          <p className="mt-2 text-xs text-ink-faint">When buying, look for &ldquo;Cloud server&rdquo;, &ldquo;ADMS&rdquo; or &ldquo;Push&rdquo; in the specifications.</p>
        </Card>
        <Card className="p-5">
          <Usb className="size-5 text-primary" />
          <h3 className="mt-3 font-semibold">USB fingerprint readers</h3>
          <p className="mt-1 text-sm text-ink-muted">A USB reader (ZKTeco SLK20R) plugged into the check-in computer. Use the Fingerprint button on the Attendance page; the one-time setup is offered there.</p>
          <Link href="/app/attendance" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open Attendance</Link>
        </Card>
        <Card className="p-5">
          <Webhook className="size-5 text-primary" />
          <h3 className="mt-3 font-semibold">Any other device or software</h3>
          <p className="mt-1 text-sm text-ink-muted">Anything that can send a web request, such as a gate controller, another brand&apos;s software, or a small bridge program, can send a check-in using a private link we give you.</p>
        </Card>
      </div>

      {/* Devices */}
      <h2 className="mb-2 font-display text-lg font-semibold">Your devices</h2>
      {data.devices.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-muted">No devices added yet. Choose <b>Add a device</b> when yours arrives. We will show you exactly what to set on it.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.devices.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{d.name}</h3>
                  <p className="text-xs text-ink-faint">{d.brand === "webhook" ? "Web request" : `Serial ${d.serial}`}{d.info ? ` · ${d.info}` : ""}</p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", !d.enabled ? "bg-surface-2 text-ink-faint" : d.online ? "bg-success/10 text-success" : "bg-surface-2 text-ink-muted")}>
                  {!d.enabled ? <>Switched off</> : d.online ? <><Wifi className="size-3.5" /> Online</> : <><WifiOff className="size-3.5" /> Not connected</>}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.modes.map((m) => { const M = MODE_META[m]; return M ? <span key={m} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs"><M.icon className="size-3.5" /> {M.label}</span> : null; })}
              </div>
              <p className="mt-3 text-xs text-ink-muted">Last contact: {ago(d.lastSeenAt)}. Last scan: {ago(d.lastScanAt)}.{d.pending > 0 ? ` ${d.pending} member${d.pending === 1 ? "" : "s"} waiting to be sent.` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setOpen(d)}>Setup and details</Button>
                {can && d.brand === "zkteco" && (
                  <Button size="sm" variant="secondary" disabled={busy === `send-${d.id}`}
                    onClick={() => run(`send-${d.id}`, () => sendMembersToDevice(d.id), (r) => `${r.queued} member${r.queued === 1 ? "" : "s"} will appear on the device within a minute or two.${Number(r.skipped) ? ` ${r.skipped} skipped (no member number, or two members share one).` : ""}`)}>
                    {busy === `send-${d.id}` ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />} Send members to device
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Recent scans */}
      {data.events.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold"><Radio className="size-4 text-primary" /> Recent scans</h2>
          <Card className="p-0">
            <ul className="divide-y divide-line-soft text-sm">
              {data.events.map((e) => {
                const r = RESULT_TEXT[e.result] ?? { text: e.result, tone: "text-ink-muted" };
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-medium">{e.name ?? `ID ${e.pin}`}</span>
                    <span className="flex items-center gap-3 text-xs text-ink-faint">
                      <span>{e.device}{e.mode ? ` · ${MODE_META[e.mode]?.label ?? e.mode}` : ""}</span>
                      <span className={r.tone}>{r.text}</span>
                      <span>{ago(e.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {adding && <AddDialog data={data} busy={busy === "add"} onClose={() => setAdding(false)}
        onAdd={(v) => run("add", () => addDevice(v), () => "Device added. Follow the steps to connect it.", () => setAdding(false))} />}

      {openDevice && (
        <Modal open onClose={() => setOpen(null)} title={openDevice.name} wide>
          <Setup device={openDevice} data={data} />
          {can && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button size="sm" variant="secondary" disabled={busy === `tog-${openDevice.id}`}
                onClick={() => run(`tog-${openDevice.id}`, () => updateDevice(openDevice.id, { enabled: !openDevice.enabled }), () => (openDevice.enabled ? "Switched off. Scans are ignored." : "Switched on."))}>
                {openDevice.enabled ? "Switch off" : "Switch on"}
              </Button>
              <Button size="sm" variant="secondary" className="text-danger" disabled={busy === `del-${openDevice.id}`}
                onClick={() => { if (window.confirm(`Remove ${openDevice.name}? Its scan history goes too. Past attendance stays.`)) void run(`del-${openDevice.id}`, () => deleteDevice(openDevice.id), () => "Removed.", () => setOpen(null)); }}>
                {busy === `del-${openDevice.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Remove
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span><div className="min-w-0 flex-1 text-sm">{children}</div></li>;
}

/** How to connect this device, written for someone standing in front of it. */
function Setup({ device, data }: { device: DeviceRow; data: DevicesData }) {
  if (device.brand === "webhook") {
    const url = `${data.baseUrl}/api/devices/event`;
    return (
      <ol className="space-y-4">
        <Step n={1}>Send a web request (POST) to this address whenever someone is recognised:<div className="mt-1.5"><CopyBox value={url} /></div></Step>
        <Step n={2}>Include this private token in a header called <code>Authorization</code>, written as <code>Bearer</code> then the token. Keep it secret.<div className="mt-1.5"><CopyBox value={device.secret ?? ""} /></div></Step>
        <Step n={3}>Send the person&apos;s ID as JSON. The ID is the number at the end of their member ID (42 for GBC-0042), or the whole member ID. The time and method are optional:<div className="mt-1.5"><CopyBox value={'{"id": "42", "time": "2026-10-14 08:03:12", "method": "face"}'} /></div><p className="mt-1 text-xs text-ink-faint">Several at once: {`{"events": [ ... ]}`}. The method can be fingerprint, face or palm.</p></Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-4">
      <Step n={1}>On the device, open the menu and find <b>Communication</b> (sometimes <b>Comm.</b>), then <b>Cloud Server Setting</b> (some models say <b>ADMS</b>).</Step>
      <Step n={2}>Set the server address to this, with no &ldquo;https://&rdquo; and no path:<div className="mt-1.5"><CopyBox value={data.host} /></div>Set the port to <b>443</b> and switch <b>HTTPS</b> on if the device has that option.</Step>
      <Step n={3}>Save. Within a minute this page should show the device as <b>Online</b>. Its serial number must be exactly <code>{device.serial}</code>.</Step>
      <Step n={4}>Put members on the device. The easy way: choose <b>Send members to device</b> on this page, then on the device pick each person and enrol their {device.modes.map((m) => MODE_META[m]?.label.toLowerCase() ?? m).join(", ") || "face, palm or finger"}. Or add them on the device by hand, using the number at the end of their member ID as the User ID (42 for GBC-0042).</Step>
      <Step n={5}>Scan. The person is checked in to the service that is on, and the scan appears under Recent scans.</Step>
      <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-muted">The device&apos;s clock should show your local time. If the device only supports plain HTTP and cannot use HTTPS, it cannot reach WorshipHQ directly. Tell us the model and we will help.</p>
    </ol>
  );
}

function AddDialog({ data, busy, onClose, onAdd }: { data: DevicesData; busy: boolean; onClose: () => void; onAdd: (v: { name: string; brand: "zkteco" | "webhook"; serial?: string; modes: string[] }) => void }) {
  const [brand, setBrand] = useState<"zkteco" | "webhook">("zkteco");
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [modes, setModes] = useState<string[]>(["face"]);
  const toggle = (m: string) => setModes((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  return (
    <Modal open onClose={onClose} title="Add a device" description={`Connects to ${data.host}.`}>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {([["zkteco", "Face, palm or fingerprint terminal", "ZKTeco and compatible"], ["webhook", "Other device or software", "Sends a web request"]] as const).map(([k, t, s]) => (
            <button key={k} type="button" onClick={() => setBrand(k)} className={cn("rounded-xl border p-3 text-left transition-colors", brand === k ? "border-primary ring-2 ring-primary/30" : "border-line hover:bg-surface-2")}>
              <div className="text-sm font-semibold">{t}</div><div className="text-xs text-ink-muted">{s}</div>
            </button>
          ))}
        </div>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main door" /></div>
        {brand === "zkteco" && (
          <div><Label>Serial number (SN)</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Printed on the label, or in the device's Device Info menu" /></div>
        )}
        <div>
          <Label>What does it read?</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(MODE_META).map(([k, m]) => (
              <button key={k} type="button" onClick={() => toggle(k)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", modes.includes(k) ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted")}>
                <m.icon className="size-4" /> {m.label}{modes.includes(k) && <X className="size-3" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" disabled={busy || !name.trim() || (brand === "zkteco" && serial.trim().length < 4)} onClick={() => onAdd({ name, brand, serial, modes })}>
            {busy ? <><Loader2 className="size-4 animate-spin" /> Adding…</> : "Add device"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
