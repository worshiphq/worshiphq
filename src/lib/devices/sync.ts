import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deviceChurchAllowed, personForPin } from "@/lib/devices/punch";
import {
  BIO, INFO_COMMAND, canCopyTemplate, coalesce, deleteFingerCommand, devicePin, fingerName, fingerNo, keyFromBody,
  kindOfBioType, majorFor, mergeReported, planMemberSync, sharesWithUsbScanner, templateCommand, userInfoCommand, validTemplate,
  wantedMembers, type MemberWant, type ParsedTemplate, type QueuedCommand, type Reported, type StoredTemplate,
} from "@/lib/devices/protocol";

/**
 * Keeps a church's ZKTeco terminals in step with WorshipHQ:
 *  - members: added, renamed, renumbered, archived, deleted or locked people are added to or removed from every
 *    device (queueMemberSync, with reconcileIfDue as a backstop for any change made elsewhere);
 *  - registrations: a face, palm or fingerprint registered on one device is copied to the church's other devices
 *    that use the same algorithm version, and version 10 fingerprints are shared with the USB scanner both ways.
 * Nothing here ever throws into the caller: a device problem must never block saving a member.
 * Templates are never logged, audited, exported or returned to a browser.
 */

type Device = { id: string; churchId: string; name: string; enabled: boolean; reported: Prisma.JsonValue | null; lastSeenAt?: Date | null };

const asReported = (v: Prisma.JsonValue | null | undefined): Reported => (v && typeof v === "object" && !Array.isArray(v) ? (v as Reported) : {});
// Only the error's code or name: a database error message can echo the values it was given, templates included.
const quiet = (where: string) => (e: unknown) => console.error(`[device-sync] ${where} failed:`, (e as { code?: string })?.code ?? (e as Error)?.name ?? "error");

async function zkDevices(churchId: string): Promise<Device[]> {
  return db.biometricDevice.findMany({
    where: { churchId, brand: "zkteco" },
    select: { id: true, churchId: true, name: true, enabled: true, reported: true, lastSeenAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Automatic sync is on for this church (its setting, and a plan with devices). */
async function autoSyncOn(churchId: string): Promise<boolean> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { deviceAutoSync: true } });
  if (!church?.deviceAutoSync) return false;
  return deviceChurchAllowed(churchId);
}

/** Add commands to a device's queue, replacing unsent ones about the same thing (see coalesce). */
export async function enqueue(deviceId: string, cmds: QueuedCommand[]) {
  if (!cmds.length) return;
  const pending = await db.biometricDeviceCommand.findMany({ where: { deviceId, sentAt: null }, select: { id: true, key: true, body: true } });
  // Commands queued before keys were kept: read the key from the text.
  const existing = pending.map((p) => ({ id: p.id, key: p.key ?? keyFromBody(p.body) }));
  const plan = coalesce(existing, cmds);
  if (plan.dropIds.length) await db.biometricDeviceCommand.deleteMany({ where: { deviceId, sentAt: null, id: { in: plan.dropIds } } });
  for (const r of plan.rewrite) await db.biometricDeviceCommand.updateMany({ where: { id: r.id, deviceId, sentAt: null }, data: { body: r.body } });
  for (let i = 0; i < plan.insert.length; i += 500) {
    await db.biometricDeviceCommand.createMany({ data: plan.insert.slice(i, i + 500).map((c) => ({ deviceId, key: c.key, body: c.body })) });
  }
}

type TemplateRow = StoredTemplate & { personId: string; sourceDeviceId: string | null };
const TEMPLATE_SELECT = { personId: true, pin: true, bioType: true, no: true, index: true, majorVer: true, minorVer: true, format: true, data: true, size: true, sourceDeviceId: true } as const;

/** The commands that put these templates (under `pin`) on `device`, skipping what it cannot read. */
function templateCommandsFor(device: Device, templates: TemplateRow[], pin: string, opts: { includeOwn: boolean }): QueuedCommand[] {
  const rep = asReported(device.reported);
  const out: QueuedCommand[] = [];
  for (const t of templates) {
    if (!opts.includeOwn && t.sourceDeviceId === device.id) continue;
    if (!canCopyTemplate(t, rep)) continue;
    const c = templateCommand({ ...t, pin }, rep);
    if (c) out.push(c);
  }
  return out;
}

/* ── Members ──────────────────────────────────────────────────────────── */

/**
 * Bring the devices up to date for these people (or "all"): call after a person is added, edited, renumbered,
 * archived, deleted or restored, or after an import. Cheap when the church has no ZKTeco devices.
 */
export async function queueMemberSync(churchId: string, personIds: string[] | "all"): Promise<void> {
  try {
    if (personIds !== "all" && personIds.length === 0) return;
    const devices = await zkDevices(churchId);
    if (!devices.length || !(await autoSyncOn(churchId))) return;

    // Number clashes are church-wide (a shared number cannot be told apart at the door), so every member ID is read.
    const { lockedPersonIds } = await import("@/lib/member-lock");
    const [people, locked, state] = await Promise.all([
      db.person.findMany({ where: { churchId, memberId: { not: null } }, select: { id: true, memberId: true, firstName: true, lastName: true, status: true } }),
      lockedPersonIds(churchId),
      db.biometricSyncedMember.findMany({ where: { churchId, ...(personIds === "all" ? {} : { personId: { in: personIds } }) } }),
    ]);
    const want = wantedMembers(people, locked);
    const had = new Map<string, MemberWant>(state.map((s) => [s.personId, { pin: s.pin, name: s.name }]));

    const scope = personIds === "all" ? [...new Set([...want.keys(), ...had.keys()])] : personIds;
    const plan = planMemberSync(want, had, scope);
    if (!plan.commands.length && !plan.remove.length) return;

    // People new to the devices, or with a new number: their saved registrations follow them.
    const moved = plan.updates.filter((u) => u.pinChanged);
    const templates = new Map<string, TemplateRow[]>();
    for (let i = 0; i < moved.length; i += 300) {
      const chunk = moved.slice(i, i + 300);
      const rows = await db.biometricTemplate.findMany({ where: { churchId, personId: { in: chunk.map((m) => m.personId) } }, select: TEMPLATE_SELECT });
      for (const r of rows) templates.set(r.personId, [...(templates.get(r.personId) ?? []), r]);
    }
    for (const m of moved) {
      const rows = templates.get(m.personId);
      if (rows?.some((r) => r.pin !== m.pin)) await db.biometricTemplate.updateMany({ where: { churchId, personId: m.personId, pin: { not: m.pin } }, data: { pin: m.pin } }).catch(quiet("renumber templates"));
    }

    for (const d of devices) {
      const cmds = [...plan.commands];
      for (const m of moved) cmds.push(...templateCommandsFor(d, templates.get(m.personId) ?? [], m.pin, { includeOwn: true }));
      await enqueue(d.id, cmds);
    }
    await saveState(churchId, plan.save, plan.remove);
  } catch (e) {
    quiet("member sync")(e);
  }
}

async function saveState(churchId: string, save: { personId: string; pin: string; name: string }[], remove: string[]) {
  if (remove.length) await db.biometricSyncedMember.deleteMany({ where: { churchId, personId: { in: remove } } });
  if (!save.length) return;
  await db.biometricSyncedMember.deleteMany({ where: { churchId, personId: { in: save.map((s) => s.personId) } } });
  for (let i = 0; i < save.length; i += 500) {
    await db.biometricSyncedMember.createMany({ data: save.slice(i, i + 500).map((s) => ({ churchId, ...s })), skipDuplicates: true });
  }
}

const RECONCILE_EVERY_MS = 15 * 60_000;

/**
 * Backstop for changes made where no hook runs (plan limit changes, automatic inactive, desktop app, linked
 * churches): when a device asks for work, check the whole church at most every 15 minutes.
 */
export async function reconcileIfDue(device: { id: string; churchId: string; reconciledAt: Date | null }) {
  if (device.reconciledAt && Date.now() - device.reconciledAt.getTime() < RECONCILE_EVERY_MS) return;
  const claimed = await db.biometricDevice.updateMany({
    where: { id: device.id, OR: [{ reconciledAt: null }, { reconciledAt: { lt: new Date(Date.now() - RECONCILE_EVERY_MS) } }] },
    data: { reconciledAt: new Date() },
  }).catch(() => ({ count: 0 }));
  if (claimed.count) await queueMemberSync(device.churchId, "all");
}

/**
 * Everything a device should hold: every member who should be on it, then every registration it can read.
 * Used by "Send members to device" and when a device first contacts WorshipHQ or first reports its versions.
 * Replaces the device's unsent queue.
 */
export async function fullSyncDevice(deviceId: string, opts: { members?: boolean } = {}) {
  const device = await db.biometricDevice.findUnique({ where: { id: deviceId }, select: { id: true, churchId: true, name: true, enabled: true, reported: true, brand: true } });
  if (!device || device.brand !== "zkteco") return { queued: 0, skipped: 0, templates: 0 };
  const churchId = device.churchId;
  const { lockedPersonIds } = await import("@/lib/member-lock");
  const [people, locked] = await Promise.all([
    db.person.findMany({ where: { churchId, memberId: { not: null } }, select: { id: true, memberId: true, firstName: true, lastName: true, status: true }, orderBy: { memberId: "asc" } }),
    lockedPersonIds(churchId),
  ]);
  const want = wantedMembers(people, locked);
  const withNumber = people.filter((p) => p.status === "active" && !locked.has(p.id) && devicePin(p.memberId)).length;
  const cmds: QueuedCommand[] = [];
  if (opts.members !== false) {
    for (const w of want.values()) cmds.push(userInfoCommand(w.pin, w.name));
  }
  let templates = 0;
  for (let skip = 0; ; skip += 500) {
    const rows = await db.biometricTemplate.findMany({ where: { churchId }, select: TEMPLATE_SELECT, orderBy: { id: "asc" }, skip, take: 500 });
    for (const r of rows) {
      const w = want.get(r.personId);
      if (!w) continue;
      const c = templateCommandsFor(device, [r], w.pin, { includeOwn: false });
      templates += c.length;
      cmds.push(...c);
    }
    if (rows.length < 500) break;
  }
  if (opts.members !== false) {
    // A full resend: start the queue again (unsent registrations are re-added above in the right order). Unsent
    // removals (and a request for the device's versions) stay, ahead of everything new.
    await db.biometricDeviceCommand.deleteMany({ where: { deviceId, sentAt: null, NOT: { OR: [{ body: { startsWith: "DATA DELETE USERINFO" } }, { key: "info" }] } } });
    for (let i = 0; i < cmds.length; i += 500) await db.biometricDeviceCommand.createMany({ data: cmds.slice(i, i + 500).map((c) => ({ deviceId, key: c.key, body: c.body })) });
    // With one device, what it now has is what every device has: remember it, so the next check sends only changes.
    const count = await db.biometricDevice.count({ where: { churchId, brand: "zkteco" } });
    if (count === 1) await saveState(churchId, [...want].map(([personId, w]) => ({ personId, ...w })), []);
  } else {
    await enqueue(deviceId, cmds);
  }
  return { queued: want.size, skipped: withNumber - want.size, templates };
}

/** Every device gets the full list (used when automatic sync is turned on); then that list is remembered. */
export async function resyncAllDevices(churchId: string) {
  for (const d of await zkDevices(churchId)) await fullSyncDevice(d.id);
  const { lockedPersonIds } = await import("@/lib/member-lock");
  const [people, locked] = await Promise.all([
    db.person.findMany({ where: { churchId, memberId: { not: null } }, select: { id: true, memberId: true, firstName: true, lastName: true, status: true } }),
    lockedPersonIds(churchId),
  ]);
  // People who are no longer wanted stay remembered, so the next check removes them from every device.
  await saveState(churchId, [...wantedMembers(people, locked)].map(([personId, w]) => ({ personId, ...w })), []);
}

/* ── What devices say about themselves ────────────────────────────────── */

const hasVersions = (r: Reported) => !!(r.fp || r.face || r.palm || r.vlFace || (r.bio && Object.keys(r.bio).length));

/** Keep what a device reported. The first time its versions are known, it gets every registration it can read. */
export async function recordReported(device: Device, next: Reported) {
  try {
    if (!Object.keys(next).length) return;
    const before = asReported(device.reported);
    const merged = mergeReported(before, next);
    if (JSON.stringify(merged) === JSON.stringify(before)) return;
    await db.biometricDevice.update({ where: { id: device.id }, data: { reported: merged as Prisma.InputJsonValue } });
    device.reported = merged as Prisma.JsonValue;
    const versionsChanged = ["fp", "face", "palm", "vlFace", "biodata"].some((k) => before[k as keyof Reported] !== merged[k as keyof Reported]) || JSON.stringify(before.bio ?? {}) !== JSON.stringify(merged.bio ?? {});
    if (versionsChanged && hasVersions(merged) && (await autoSyncOn(device.churchId))) await fullSyncDevice(device.id, { members: false });
  } catch (e) {
    quiet("record versions")(e);
  }
}

/** The first time a device contacts WorshipHQ: ask it to report itself, and send it everyone. */
export async function onDeviceHello(device: Device) {
  try {
    // INFO first, so the versions are known before any registrations are copied to it.
    await enqueue(device.id, [INFO_COMMAND]);
    if (!device.lastSeenAt && (await autoSyncOn(device.churchId))) {
      // The church's first synced device: every device starts from the full list. Otherwise just this one.
      const any = await db.biometricSyncedMember.findFirst({ where: { churchId: device.churchId }, select: { personId: true } });
      if (any) await fullSyncDevice(device.id);
      else await resyncAllDevices(device.churchId);
    }
  } catch (e) {
    quiet("hello")(e);
  }
}

/* ── Registrations ────────────────────────────────────────────────────── */

/**
 * Registrations a device uploaded. Each is kept against its member, copied to the church's other devices that use
 * the same algorithm version, and (version 10 fingerprints only) saved for the USB scanner.
 */
export async function handleTemplateUpload(device: Device, lines: ParsedTemplate[]): Promise<number> {
  try {
    if (!lines.length || !(await deviceChurchAllowed(device.churchId))) return 0;
    const churchId = device.churchId;
    let rep = asReported(device.reported);
    if (lines.some((l) => l.source === "BIODATA") && !rep.biodata) {
      await recordReported(device, { biodata: true });
      rep = asReported(device.reported);
    }
    const sync = await autoSyncOn(churchId);
    const others = sync ? (await zkDevices(churchId)).filter((d) => d.id !== device.id) : [];
    const out = new Map<string, QueuedCommand[]>();
    const people = new Map<string, Awaited<ReturnType<typeof personForPin>>>();
    const synced = new Map((await db.biometricSyncedMember.findMany({ where: { churchId, pin: { in: [...new Set(lines.map((l) => l.pin))] } }, select: { personId: true, pin: true } })).map((s) => [s.personId, s.pin]));
    let saved = 0;

    for (const l of lines.slice(0, 200)) {
      if (!l.valid || !validTemplate(l.data)) continue;
      if (!people.has(l.pin)) people.set(l.pin, await personForPin(churchId, l.pin));
      const person = people.get(l.pin);
      if (!person) continue;
      const majorVer = l.majorVer ?? majorFor(rep, l.bioType);
      const where = { churchId_pin_bioType_no_index: { churchId, pin: l.pin, bioType: l.bioType, no: l.no, index: l.index } };
      const same = await db.biometricTemplate.findUnique({ where, select: { data: true, personId: true } });
      if (same && same.data === l.data && same.personId === person.id) continue; // our own copy coming back
      const row = {
        personId: person.id, type: kindOfBioType(l.bioType), majorVer, minorVer: l.minorVer, format: l.format,
        data: l.data, size: l.size, sourceDeviceId: device.id,
      };
      await db.biometricTemplate.upsert({ where, create: { churchId, pin: l.pin, bioType: l.bioType, no: l.no, index: l.index, ...row }, update: row });
      saved++;

      if (!sync || synced.get(person.id) !== l.pin) continue; // not (or not yet) on the devices: locked, inactive, shared number
      const t: TemplateRow = { ...row, pin: l.pin, bioType: l.bioType, no: l.no, index: l.index };
      for (const d of others) out.set(d.id, [...(out.get(d.id) ?? []), ...templateCommandsFor(d, [t], l.pin, { includeOwn: false })]);
      if (sharesWithUsbScanner(t)) await saveForUsbScanner(churchId, person.id, l.no, l.data, device.name);
    }
    for (const [id, cmds] of out) await enqueue(id, cmds);
    return saved;
  } catch (e) {
    quiet("template upload")(e);
    return 0;
  }
}

async function saveForUsbScanner(churchId: string, personId: string, no: number, data: string, deviceName: string) {
  const finger = fingerName(no);
  if (!finger) return;
  const have = await db.biometricCredential.findFirst({ where: { churchId, personId, type: "scanner", finger }, select: { templateData: true } });
  if (have?.templateData === data) return;
  await db.biometricCredential.deleteMany({ where: { churchId, personId, type: "scanner", finger } });
  await db.biometricCredential.create({ data: { churchId, personId, type: "scanner", format: "zkfp", finger, templateData: data, quality: 0, deviceName: `${deviceName} (device)`.slice(0, 80) } });
}

/** A fingerprint saved from the USB scanner: keep it for the devices and send it to those that read version 10. */
export async function shareScannerFingerprint(churchId: string, personId: string, finger: string | null, data: string, format: string | null) {
  try {
    const no = fingerNo(finger);
    if (no === null || format !== "zkfp" || !validTemplate(data)) return;
    const person = await db.person.findFirst({ where: { id: personId, churchId }, select: { memberId: true } });
    const pin = devicePin(person?.memberId);
    if (!pin) return;
    const where = { churchId_pin_bioType_no_index: { churchId, pin, bioType: BIO.finger, no, index: 0 } };
    const row = { personId, type: "fingerprint", majorVer: 10, minorVer: 0, format: 0, data, size: data.length, sourceDeviceId: null };
    await db.biometricTemplate.upsert({ where, create: { churchId, pin, bioType: BIO.finger, no, index: 0, ...row }, update: row });
    if (!(await autoSyncOn(churchId))) return;
    const synced = await db.biometricSyncedMember.findUnique({ where: { churchId_personId: { churchId, personId } }, select: { pin: true } });
    if (synced?.pin !== pin) return;
    const t: TemplateRow = { ...row, pin, bioType: BIO.finger, no, index: 0 };
    for (const d of await zkDevices(churchId)) await enqueue(d.id, templateCommandsFor(d, [t], pin, { includeOwn: true }));
  } catch (e) {
    quiet("share scanner fingerprint")(e);
  }
}

/** A finger removed in WorshipHQ: forget it for the devices and remove it from those that took it. */
export async function removeScannerFingerprint(churchId: string, personId: string, finger: string | null) {
  try {
    const no = fingerNo(finger);
    if (no === null) return;
    await db.biometricTemplate.deleteMany({ where: { churchId, personId, bioType: BIO.finger, no } });
    const synced = await db.biometricSyncedMember.findUnique({ where: { churchId_personId: { churchId, personId } }, select: { pin: true } });
    if (!synced) return;
    for (const d of await zkDevices(churchId)) {
      const rep = asReported(d.reported);
      if (majorFor(rep, BIO.finger) === 10) await enqueue(d.id, [deleteFingerCommand(synced.pin, no, rep)]);
    }
  } catch (e) {
    quiet("remove scanner fingerprint")(e);
  }
}

/* ── For the screens (never the templates themselves) ─────────────────── */

const KIND_LABEL: Record<string, string> = { fingerprint: "finger", face: "face", palm: "palm", other: "other" };

/** "Registered on: Main door (face, finger)", where copies went, and devices the member must register on themselves. */
export async function registeredOn(churchId: string, personId: string) {
  const [rows, devices] = await Promise.all([
    db.biometricTemplate.findMany({ where: { churchId, personId }, select: { bioType: true, majorVer: true, sourceDeviceId: true } }),
    zkDevices(churchId),
  ]);
  const label = (kinds: Set<string>) => [...kinds].map((k) => KIND_LABEL[k] ?? k).join(", ");
  const registered: { device: string; kinds: string }[] = [];
  const copied: { device: string; kinds: string }[] = [];
  const registerHere: { device: string; kinds: string }[] = [];
  const usb = rows.filter((r) => r.sourceDeviceId === null);
  if (usb.length) registered.push({ device: "USB scanner", kinds: "finger" });
  for (const d of devices) {
    const rep = asReported(d.reported);
    const own = new Set(rows.filter((r) => r.sourceDeviceId === d.id).map((r) => kindOfBioType(r.bioType)));
    const got = new Set<string>();
    const missing = new Set<string>();
    for (const r of rows) {
      if (r.sourceDeviceId === d.id) continue;
      const k = kindOfBioType(r.bioType);
      if (own.has(k)) continue;
      if (canCopyTemplate(r, rep)) got.add(k);
      else missing.add(k);
    }
    for (const k of got) missing.delete(k);
    if (own.size) registered.push({ device: d.name, kinds: label(own) });
    if (got.size) copied.push({ device: d.name, kinds: label(got) });
    if (missing.size) registerHere.push({ device: d.name, kinds: label(missing) });
  }
  return { registered, copied, registerHere };
}

/** Per device: registrations received from it. */
export async function templatesReceivedByDevice(churchId: string): Promise<Map<string, number>> {
  const rows = await db.biometricTemplate.groupBy({ by: ["sourceDeviceId"], where: { churchId, sourceDeviceId: { not: null } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.sourceDeviceId!, r._count._all]));
}

export { asReported };
