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
  outside_hours: { text: "Outside scan hours, ignored", tone: "text-ink-faint" },
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
          <p className="mt-1 text-sm text-ink-muted">ZKTeco and compatible terminals (SpeedFace, ProFace, MB and iClock families, and many rebranded ones). They connect to WorshipHQ through their built-in cloud server setting, straight over the internet when they can use a web address and HTTPS, or through a small bridge program on a computer in your building when they cannot.</p>
          <p className="mt-2 text-xs text-ink-faint">When buying, look for &ldquo;Cloud server&rdquo;, &ldquo;ADMS&rdquo; or &ldquo;Push&rdquo; in the specifications, and ask the seller if it can send to a web address over HTTPS. See the guide below.</p>
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

      <Guide startOpen={data.devices.length === 0} />

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
              {d.enabled && !d.lastSeenAt && d.brand === "zkteco" && <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-ink">Waiting for the device to contact WorshipHQ. Open <b>Setup and details</b> for the steps.</p>}
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
          <ScanHours key={`${openDevice.id}-${openDevice.scanRule}-${openDevice.windowDays.join()}-${openDevice.windowStart}-${openDevice.windowEnd}`} device={openDevice} serviceTimesOn={data.serviceTimesOn} canEdit={can} busy={busy === `hours-${openDevice.id}`}
            onSave={(v) => run(`hours-${openDevice.id}`, () => updateDevice(openDevice.id, v), () => "Scan hours saved.")} />
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

/** Where this device is in getting set up: added, then it contacts us, then its first scan. */
function Progress({ device }: { device: DeviceRow }) {
  const rows: { done: boolean; text: string; hint?: string }[] = [
    { done: true, text: "Device added to WorshipHQ" },
    { done: !!device.lastSeenAt, text: device.lastSeenAt ? `The device has contacted WorshipHQ (${ago(device.lastSeenAt)})` : "Waiting for the device to contact WorshipHQ", hint: "Follow the steps below, then press Refresh. A device checks in about every 2 minutes. If nothing happens, see Troubleshooting in the guide on this page." },
    { done: !!device.lastScanAt, text: device.lastScanAt ? `First scan received (last one ${ago(device.lastScanAt)})` : "Waiting for the first scan", hint: "Enrol a face, palm or finger on the device, then scan it." },
  ];
  const firstOpen = rows.findIndex((r) => !r.done);
  return (
    <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex items-start gap-2">
          {r.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <span className="mt-1.5 size-2.5 shrink-0 rounded-full border border-ink-faint" />}
          <span className={cn(r.done ? "text-ink" : "text-ink-muted")}>{r.text}{!r.done && i === firstOpen && r.hint ? <span className="mt-0.5 block text-xs text-ink-faint">{r.hint}</span> : null}</span>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** When should this device's scans count? Keeps a cleaner or a mid-week visitor out of attendance. */
function ScanHours({ device, serviceTimesOn, canEdit, onSave, busy }: { device: DeviceRow; serviceTimesOn: boolean; canEdit: boolean; busy: boolean; onSave: (v: { scanRule: string; windowDays: number[]; windowStart: string; windowEnd: string }) => void }) {
  const [rule, setRule] = useState<DeviceRow["scanRule"]>(device.scanRule);
  const [days, setDays] = useState<number[]>(device.windowDays);
  const [start, setStart] = useState(device.windowStart ?? "06:00");
  const [end, setEnd] = useState(device.windowEnd ?? "13:00");
  const dirty = rule !== device.scanRule || (rule === "custom" && (start !== (device.windowStart ?? "06:00") || end !== (device.windowEnd ?? "13:00") || days.join() !== device.windowDays.join()));
  const opt = (k: DeviceRow["scanRule"], title: string, text: string) => (
    <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-sm", rule === k ? "border-primary bg-primary/5" : "border-line hover:bg-surface-2")}>
      <input type="radio" name={`rule-${device.id}`} checked={rule === k} onChange={() => setRule(k)} disabled={!canEdit} className="mt-1 accent-primary" />
      <span><span className="font-medium">{title}</span><span className="block text-xs text-ink-muted">{text}</span></span>
    </label>
  );
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h4 className="font-semibold">When should scans count?</h4>
      <p className="mt-1 text-sm text-ink-muted">A scan outside these hours is ignored, so a cleaner or someone passing on a Tuesday is not counted as attendance. It still shows under Recent scans.</p>
      <div className="mt-3 space-y-2">
        {opt("service-times", "During my service times (recommended)", "Counts from a little before a service starts to a little after it ends, using the grace time in Settings, Service times.")}
        {rule === "service-times" && !serviceTimesOn && (
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-ink">You have not set up service times yet, so for now every scan counts. Add them in <Link href="/app/settings?tab=service-times" className="font-medium text-primary underline">Settings, Service times</Link>, or choose your own hours below.</p>
        )}
        {opt("custom", "Only these days and hours", "For example Sundays from 06:00 to 13:00.")}
        {rule === "custom" && (
          <div className="space-y-3 rounded-xl bg-surface-2 p-3">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => (
                <button key={d} type="button" disabled={!canEdit} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort()))}
                  className={cn("rounded-lg border px-3 py-1 text-sm", days.includes(i) ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-muted")}>{d}</button>
              ))}
              <span className="self-center text-xs text-ink-faint">{days.length === 0 ? "No day ticked means every day." : ""}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              From <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} disabled={!canEdit} className="w-32" /> to <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} disabled={!canEdit} className="w-32" />
            </div>
          </div>
        )}
        {opt("always", "Any time", "Every scan counts. Not recommended for a door that people use all week.")}
      </div>
      {canEdit && (
        <Button size="sm" className="mt-3" disabled={!dirty || busy} onClick={() => onSave({ scanRule: rule, windowDays: days, windowStart: start, windowEnd: end })}>
          {busy ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save scan hours"}
        </Button>
      )}
    </div>
  );
}

/** How to connect this device, written for someone standing in front of it. */
function Setup({ device, data }: { device: DeviceRow; data: DevicesData }) {
  const [route, setRoute] = useState<"direct" | "bridge">("direct");
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
  const reads = device.modes.map((m) => MODE_META[m]?.label.toLowerCase() ?? m).join(", ") || "face, palm or finger";
  return (
    <div className="space-y-4">
      <Progress device={device} />

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">How will the device reach WorshipHQ?</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["direct", "Directly (most devices)", "The device can send to a web address over HTTPS."], ["bridge", "Through a bridge computer", "The device can only send to an IP address, or only over plain HTTP."]] as const).map(([k, t, s]) => (
            <button key={k} type="button" onClick={() => setRoute(k)} className={cn("rounded-xl border p-3 text-left transition-colors", route === k ? "border-primary ring-2 ring-primary/30" : "border-line hover:bg-surface-2")}>
              <div className="text-sm font-semibold">{t}</div><div className="text-xs text-ink-muted">{s}</div>
            </button>
          ))}
        </div>
      </div>

      {route === "direct" ? (
        <ol className="space-y-4">
          <Step n={1}>On the device, open the menu and find <b>Communication</b> (sometimes <b>Comm.</b>), then <b>Cloud Server Setting</b> (some models say <b>ADMS</b> or <b>Server</b>).</Step>
          <Step n={2}>Set the server address to this, with no &ldquo;https://&rdquo; and no path:<div className="mt-1.5"><CopyBox value={data.host} /></div>Set the port to <b>443</b> and switch <b>HTTPS</b> on.<p className="mt-1 text-xs text-ink-faint">If the device will only accept an IP address, or has no HTTPS option, choose &ldquo;Through a bridge computer&rdquo; above.</p></Step>
          <Step n={3}>Set the device&apos;s <b>date, time and time zone</b> to your local time. Scan times come from the device&apos;s own clock.</Step>
          <Step n={4}>Save. The device should show as <b>Online</b> above within a couple of minutes. Its serial number must be exactly <code>{device.serial}</code>.</Step>
        </ol>
      ) : (
        <ol className="space-y-4">
          <Step n={1}>Choose a Windows computer that will be <b>switched on during services</b> and is on the <b>same Wi-Fi or router</b> as the device. Install Python 3 on it from python.org if it is not there (tick &ldquo;Add Python to PATH&rdquo;).</Step>
          <Step n={2}>Download both files into one folder:
            <div className="mt-1.5 flex flex-wrap gap-2">
              <a href="/device-bridge/whq-device-bridge.bat" download className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2">whq-device-bridge.bat</a>
              <a href="/device-bridge/whq-device-bridge.py" download className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2">whq-device-bridge.py</a>
            </div>
            Then double-click the <b>.bat</b> file. A window opens and shows the computer&apos;s address, like 192.168.1.20. Leave it open.</Step>
          <Step n={3}>On the device, open <b>Communication</b>, then <b>Cloud Server Setting</b> (or <b>ADMS</b>). Set the server address to the address the bridge window shows, the port to <b>8081</b>, and switch <b>HTTPS off</b>.</Step>
          <Step n={4}>Set the device&apos;s <b>date, time and time zone</b> to your local time, then save. The device should show as <b>Online</b> above within a couple of minutes. Its serial number must be exactly <code>{device.serial}</code>.</Step>
          <p className="rounded-xl bg-surface-2 p-3 text-xs text-ink-muted">Tip: ask your router to always give that computer the same address (a &ldquo;reserved&rdquo; or &ldquo;static&rdquo; IP), or the address may change and the device will lose it. The bridge only passes on the device&apos;s own messages, and stores nothing. If the computer is off or asleep, the device keeps its scans and sends them when it reconnects (up to 36 hours later).</p>
        </ol>
      )}

      <ol className="space-y-4" start={5}>
        <Step n={5}>Put members on the device. The easy way is <b>Send members to device</b> on this page: they appear by name within a couple of minutes. Then, on the device, pick each person and enrol their {reads}. Or add people on the device by hand, using the number at the end of their member ID as the User ID (42 for GBC-0042).</Step>
        <Step n={6}>Scan. The person is checked in to the service that is on, and the scan appears under Recent scans.</Step>
      </ol>
    </div>
  );
}

function Item({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">{title}<span className="text-ink-faint transition-transform group-open:rotate-45">+</span></summary>
      <div className="space-y-2 border-t border-line px-4 py-3 text-sm text-ink-muted [&_b]:text-ink [&_li]:ml-4 [&_li]:list-disc">{children}</div>
    </details>
  );
}

/** Advice for choosing, connecting and fixing a device, so a church can work it out without us. */
function Guide({ startOpen }: { startOpen: boolean }) {
  return (
    <div className="mb-6 space-y-2">
      <h2 className="font-display text-lg font-semibold">Guide</h2>
      <Item title="Choosing a device" open={startOpen}>
        <ul className="space-y-1.5">
          <li>It must have a <b>cloud server</b>, <b>ADMS</b> or <b>push</b> setting. Ask the seller to confirm this in writing before you pay.</li>
          <li>Ask: <b>&ldquo;Can it send to a web address over HTTPS?&rdquo;</b> If yes, it connects straight to WorshipHQ. If it only takes an IP address or plain HTTP, it still works through the small <b>Device Bridge</b> program on a computer in your building.</li>
          <li>Choose what it reads: face, palm, fingerprint, or a mix. Check how many people it holds. Face models usually hold a few thousand.</li>
          <li>Most face terminals are for indoors or covered entrances. Check the weather rating if yours is open to rain.</li>
          <li>It needs power, and Ethernet or Wi-Fi to reach the internet (or your bridge computer).</li>
          <li><b>Buy one first</b> and try it at your real entrance before buying more. Distances and speeds in a brochure are best case. Recognition works best when the person faces the camera, within about a metre, in good light, with no strong light behind them.</li>
        </ul>
      </Item>
      <Item title="How scans are counted">
        <ul className="space-y-1.5">
          <li>A person&apos;s <b>first scan</b> at a service checks them in. Scanning again at the same service changes nothing, so walking past twice is fine.</li>
          <li>When two or more people are recognised together, each is counted separately.</li>
          <li>Only people whose User ID matches a member are counted. Anyone else shows under Recent scans as &ldquo;ID not matched&rdquo;.</li>
          <li><b>Scan hours</b>: scans outside the hours you choose are ignored, so a cleaner or someone passing mid-week is not counted. Set this on each device under Setup and details.</li>
          <li>Visitors are not enrolled on the device. Check them in by name or with a QR code.</li>
          <li>Face, palm and fingerprint data is sensitive. Tell members and get their consent before enrolling them, and a parent&apos;s or guardian&apos;s consent for children.</li>
        </ul>
      </Item>
      <Item title="Troubleshooting">
        <ul className="space-y-1.5">
          <li><b>The device never shows Online:</b> check the device has internet, the serial number here matches the device exactly, and the server address has no &ldquo;https://&rdquo;. Directly: port 443 with HTTPS on. Through the bridge: the bridge computer&apos;s address, port 8081, HTTPS off. Make sure the date and time are right. Then press Refresh, as devices check in about every 2 minutes.</li>
          <li><b>Online, but scans do not count:</b> look at Recent scans. &ldquo;ID not matched&rdquo; means the User ID on the device is not the number at the end of the member&apos;s ID. &ldquo;Outside scan hours&rdquo; means the scan was ignored because of the hours you set.</li>
          <li><b>Members did not appear after &ldquo;Send members to device&rdquo;:</b> the device picks them up the next time it checks in, which can take a couple of minutes. If they still do not appear, add them on the device by hand.</li>
          <li><b>Scan times are wrong:</b> set the device&apos;s date, time and time zone. WorshipHQ uses the device&apos;s clock.</li>
          <li><b>Using the bridge:</b> its window must stay open and the computer on. If it was off, the device sends the missed scans when it reconnects (up to 36 hours later).</li>
          <li><b>Nothing at all after checking everything:</b> the device may not support this way of connecting. Tell us the model and we will help.</li>
        </ul>
      </Item>
    </div>
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
