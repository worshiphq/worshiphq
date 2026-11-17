/**
 * Pure helpers for the ZKTeco PUSH (ADMS) protocol: reading what a terminal uploads, writing the commands we
 * queue for it, deciding which registrations can be copied between devices, and coalescing the queue.
 * No database and no server-only imports, so scripts/qa/device-sync.pure.qa.ts can test every rule here.
 *
 * Formats (attendance PUSH protocol, firmware 2.x / 3.x):
 *   upload  FP PIN=1\tFID=6\tSize=1184\tValid=1\tTMP=<base64>                       (legacy fingerprint, table=OPERLOG)
 *   upload  FACE PIN=1\tFID=0\tSize=2048\tValid=1\tTMP=<base64>                     (legacy near-infrared face, table=OPERLOG)
 *   upload  BIODATA Pin=1\tNo=6\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=<base64>
 *           (newer firmware, table=BIODATA, sometimes inside OPERLOG)
 *   command DATA UPDATE USERINFO PIN=1\tName=...\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=...\tVerify=0\tViceCard=
 *   command DATA DELETE USERINFO PIN=1
 *   command DATA UPDATE FINGERTMP PIN=1\tFID=6\tSize=1184\tValid=1\tTMP=<base64>
 *   command DATA DELETE FINGERTMP PIN=1\tFID=6
 *   command DATA UPDATE FACE PIN=1\tFID=0\tSize=2048\tValid=1\tTMP=<base64>
 *   command DATA UPDATE BIODATA Pin=1\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=39\tMinorVer=1\tFormat=0\tTmp=<base64>
 *   command DATA DELETE BIODATA Pin=1\tType=1\tNo=6
 * BIODATA Type: 0 general, 1 fingerprint, 2 face (near-infrared), 3 voice, 4 iris, 5 retina, 6 palm print,
 * 7 finger vein, 8 palm (vein), 9 visible-light face.
 */

export const BIO = { finger: 1, face: 2, palmPrint: 6, vein: 7, palm: 8, vlFace: 9 } as const;

export type TemplateKind = "fingerprint" | "face" | "palm" | "other";

export function kindOfBioType(type: number): TemplateKind {
  if (type === 1) return "fingerprint";
  if (type === 2 || type === 9) return "face";
  if (type === 6 || type === 8) return "palm";
  return "other";
}

/** The number a device knows a member by: the digits at the end of their member ID (GBC-0042 is 42). */
export function devicePin(memberId: string | null | undefined): string | null {
  const m = /(\d+)$/.exec(memberId ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : null;
}

/** Plain letters only: many terminals cannot show anything else, and a tab or newline would break the command. */
export function asciiName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Largest template we accept or send (a visible-light face is a few kB; this is generous). */
export const MAX_TEMPLATE_CHARS = 120_000;
export const validTemplate = (s: string | null | undefined): s is string => !!s && s.length <= MAX_TEMPLATE_CHARS && B64.test(s);
const validPin = (s: string) => /^\d{1,9}$/.test(s);

/* ── Commands ─────────────────────────────────────────────────────────── */

export type QueuedCommand = { key: string; body: string };

export function userInfoCommand(pin: string, name: string): QueuedCommand {
  const n = asciiName(name) || pin;
  return { key: `u:${pin}`, body: `DATA UPDATE USERINFO PIN=${pin}\tName=${n}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=` };
}

export function deleteUserCommand(pin: string): QueuedCommand {
  return { key: `d:${pin}`, body: `DATA DELETE USERINFO PIN=${pin}` };
}

/** Ask the device to report itself (model, firmware and algorithm versions). The reply comes to /iclock/devicecmd. */
export const INFO_COMMAND: QueuedCommand = { key: "info", body: "INFO" };

/** Ask the device to upload registrations it already holds, of one BIODATA type. Unconfirmed on real firmware. */
export function queryBioCommand(type: number): QueuedCommand {
  return { key: `q:${type}`, body: `DATA QUERY BIODATA Type=${type}` };
}

export type StoredTemplate = {
  pin: string; bioType: number; no: number; index: number; majorVer: number | null; minorVer: number | null;
  format: number; data: string; size: number | null; valid?: boolean;
};

export const templateKey = (t: { pin: string; bioType: number; no: number; index: number }) => `t:${t.pin}:${t.bioType}:${t.no}:${t.index}`;

/** The command that puts a template on a device, in the form that device understands, or null if it cannot take it. */
export function templateCommand(t: StoredTemplate, target: Reported | null): QueuedCommand | null {
  if (!validTemplate(t.data) || !validPin(t.pin)) return null;
  const size = t.size ?? t.data.length;
  const key = templateKey(t);
  if (target && supportsBiodata(target)) {
    return { key, body: `DATA UPDATE BIODATA Pin=${t.pin}\tNo=${t.no}\tIndex=${t.index}\tValid=1\tDuress=0\tType=${t.bioType}\tMajorVer=${t.majorVer ?? 0}\tMinorVer=${t.minorVer ?? 0}\tFormat=${t.format}\tTmp=${t.data}` };
  }
  if (t.bioType === BIO.finger) return { key, body: `DATA UPDATE FINGERTMP PIN=${t.pin}\tFID=${t.no}\tSize=${size}\tValid=1\tTMP=${t.data}` };
  if (t.bioType === BIO.face) return { key, body: `DATA UPDATE FACE PIN=${t.pin}\tFID=${t.index}\tSize=${size}\tValid=1\tTMP=${t.data}` };
  return null; // palm and visible-light face only travel as BIODATA
}

/** Remove one finger from a device (a finger removed in WorshipHQ). */
export function deleteFingerCommand(pin: string, no: number, target: Reported | null): QueuedCommand {
  const key = templateKey({ pin, bioType: BIO.finger, no, index: 0 });
  return target && supportsBiodata(target)
    ? { key, body: `DATA DELETE BIODATA Pin=${pin}\tType=1\tNo=${no}` }
    : { key, body: `DATA DELETE FINGERTMP PIN=${pin}\tFID=${no}` };
}

/* ── Uploads ──────────────────────────────────────────────────────────── */

export type ParsedTemplate = StoredTemplate & { source: "FP" | "FACE" | "BIODATA"; valid: boolean };

/** "PIN=1\tFID=6\tTMP=ab==" as a map, keys in lower case. Values are split on the first "=" only (base64 ends in "="). */
function fields(rest: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of rest.split("\t")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    out.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim());
  }
  return out;
}
const int = (v: string | undefined, dflt: number | null = null) => {
  if (v === undefined || v === "") return dflt;
  const n = Number(v);
  return Number.isInteger(n) ? n : dflt;
};

/**
 * Read the registrations a device uploaded (OPERLOG or BIODATA table). Unknown lines (USER, OPLOG, photos) are
 * skipped. A legacy FP or FACE line does not say its algorithm version: `majorVer` is null and the caller fills it
 * in from what the device reported.
 */
export function parseTemplateLines(body: string, table?: string | null): ParsedTemplate[] {
  const out: ParsedTemplate[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let kind = null as "FP" | "FACE" | "BIODATA" | null;
    let rest = line;
    const head = /^(FP|FACE|BIODATA)\s+/i.exec(line);
    if (head) { kind = head[1].toUpperCase() as "FP" | "FACE" | "BIODATA"; rest = line.slice(head[0].length); }
    else if ((table ?? "").toUpperCase() === "BIODATA" && /(^|\t)Pin=/i.test(line)) kind = "BIODATA";
    if (!kind) continue;
    const f = fields(rest);
    const pin = (f.get("pin") ?? "").replace(/^0+(?=\d)/, "");
    const data = f.get("tmp") ?? "";
    if (!validPin(pin) || !validTemplate(data)) continue;
    const size = int(f.get("size"));
    const valid = int(f.get("valid"), 1) !== 0;
    if (kind === "FP") {
      const fid = int(f.get("fid"));
      if (fid === null || fid < 0 || fid > 9) continue;
      out.push({ source: kind, pin, bioType: BIO.finger, no: fid, index: 0, majorVer: null, minorVer: null, format: 0, data, size, valid });
    } else if (kind === "FACE") {
      const fid = int(f.get("fid"), 0)!;
      if (fid < 0 || fid > 63) continue;
      out.push({ source: kind, pin, bioType: BIO.face, no: 0, index: fid, majorVer: null, minorVer: null, format: 0, data, size, valid });
    } else {
      const type = int(f.get("type"));
      if (type === null || type < 0 || type > 20) continue;
      const no = int(f.get("no"), 0)!;
      const index = int(f.get("index"), 0)!;
      if (no < 0 || no > 63 || index < 0 || index > 63) continue;
      out.push({
        source: kind, pin, bioType: type, no, index, majorVer: int(f.get("majorver")), minorVer: int(f.get("minorver")),
        format: int(f.get("format"), 0)!, data, size, valid,
      });
    }
  }
  return out;
}

/* ── What a device says about itself ──────────────────────────────────── */

/** What a device reported: algorithm major versions, whether it takes BIODATA, and its own counts. */
export type Reported = {
  fp?: number | null; face?: number | null; palm?: number | null; vlFace?: number | null;
  /** Major version per BIODATA type, from MultiBioVersion. */
  bio?: Record<string, number>;
  biodata?: boolean;
  users?: number | null; fingers?: number | null; faces?: number | null;
  model?: string | null; firmware?: string | null;
};

const major = (v: string | undefined | null): number | null => {
  const m = /^\s*(\d+)/.exec(v ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
};
const count = (v: string | undefined | null): number | null => {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * The INFO value a device adds to /iclock/getrequest:
 *   firmware, user count, fingerprint count, record count, IP, fingerprint version, face version, face count, ...
 * e.g. "Ver 8.0.4.2-20190101,12,20,345,192.168.1.201,10,7,24,0,111"
 */
export function parseInfoParam(info: string | null | undefined): Reported {
  if (!info) return {};
  const c = info.split(",");
  const out: Reported = {};
  if (c[0]?.trim()) out.firmware = c[0].trim().slice(0, 60);
  out.users = count(c[1]);
  out.fingers = count(c[2]);
  if (c.length > 5) out.fp = major(c[5]);
  if (c.length > 6) out.face = major(c[6]);
  if (c.length > 7) out.faces = count(c[7]);
  return strip(out);
}

/**
 * Options a device posts (POST /iclock/cdata?table=options, or its reply to the INFO command): key=value pairs
 * separated by commas or new lines, sometimes starting with "~". Recognises FPVersion / ZKFPVersion, FaceVersion,
 * PvVersion (palm), MultiBioDataSupport and MultiBioVersion (colon lists by BIODATA type), and the counts.
 */
export function parseOptions(body: string | null | undefined): Reported {
  if (!body) return {};
  const kv = new Map<string, string>();
  for (const part of body.split(/[,\r\n&]+/)) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    kv.set(part.slice(0, i).trim().replace(/^~/, "").toLowerCase(), part.slice(i + 1).trim());
  }
  const out: Reported = {};
  const fp = major(kv.get("fpversion") ?? kv.get("zkfpversion"));
  if (fp) out.fp = fp;
  const face = major(kv.get("faceversion"));
  if (face) out.face = face;
  const palm = major(kv.get("pvversion") ?? kv.get("palmversion"));
  if (palm) out.palm = palm;
  const vl = major(kv.get("visilightfaceversion") ?? kv.get("vlfaceversion"));
  if (vl) out.vlFace = vl;
  const support = kv.get("multibiodatasupport");
  const versions = kv.get("multibioversion");
  if (support !== undefined || versions !== undefined) {
    const sup = (support ?? "").split(":");
    const ver = (versions ?? "").split(":");
    const bio: Record<string, number> = {};
    for (let t = 0; t < Math.max(sup.length, ver.length); t++) {
      if (support !== undefined && sup[t]?.trim() !== "1") continue;
      const m = major(ver[t]);
      if (m) bio[String(t)] = m;
    }
    if (Object.keys(bio).length) out.bio = bio;
    if (sup.some((s) => s.trim() === "1")) out.biodata = true;
  }
  const users = count(kv.get("usercount"));
  if (users !== null) out.users = users;
  const fingers = count(kv.get("fpcount"));
  if (fingers !== null) out.fingers = fingers;
  const faces = count(kv.get("facecount"));
  if (faces !== null) out.faces = faces;
  const model = kv.get("devicename");
  if (model) out.model = model.slice(0, 60);
  const fw = kv.get("fwversion") ?? kv.get("firmver");
  if (fw) out.firmware = fw.slice(0, 60);
  return out;
}

function strip(r: Reported): Reported {
  const out: Reported = {};
  for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Newer reports win field by field; a field the new report leaves out is kept. */
export function mergeReported(old: Reported | null | undefined, next: Reported): Reported {
  return { ...(old ?? {}), ...strip(next), ...(old?.bio || next.bio ? { bio: { ...(old?.bio ?? {}), ...(next.bio ?? {}) } } : {}) };
}

/* ── Which registrations can be copied ────────────────────────────────── */

export function supportsBiodata(r: Reported | null | undefined): boolean {
  return !!r && (r.biodata === true || (!!r.bio && Object.keys(r.bio).length > 0));
}

/** The algorithm major version a device uses for one BIODATA type, or null when it has not said. */
export function majorFor(r: Reported | null | undefined, bioType: number): number | null {
  if (!r) return null;
  const fromBio = r.bio?.[String(bioType)];
  if (fromBio && fromBio > 0) return fromBio;
  if (bioType === BIO.finger) return r.fp ?? null;
  if (bioType === BIO.face) return r.face ?? null;
  if (bioType === BIO.vlFace) return r.vlFace ?? null;
  if (bioType === BIO.palm || bioType === BIO.palmPrint) return r.palm ?? null;
  return null;
}

/**
 * Can this registration be copied to that device? Only when both sides are known and use the same algorithm
 * major version (a version 10 fingerprint is unreadable to a version 12 reader, and face versions differ the same
 * way), and the device can take the command for that kind. Unknown means no: the member registers on that device.
 */
export function canCopyTemplate(t: { bioType: number; majorVer: number | null }, target: Reported | null | undefined): boolean {
  if (!t.majorVer) return false;
  const m = majorFor(target, t.bioType);
  if (!m || m !== t.majorVer) return false;
  if (supportsBiodata(target)) return true;
  return t.bioType === BIO.finger || t.bioType === BIO.face;
}

/** The USB scanner's ZKFinger SDK reads and writes version 10 fingerprints in ZKTeco's own format. */
export const USB_SCANNER_FP_VERSION = 10;

/** A device fingerprint the USB scanner can match (version 10, ZKTeco format). Everything else stays device-only. */
export function sharesWithUsbScanner(t: { bioType: number; majorVer: number | null; format?: number | null }): boolean {
  return t.bioType === BIO.finger && t.majorVer === USB_SCANNER_FP_VERSION && (t.format ?? 0) === 0;
}

/** Can a device take fingerprints registered on the USB scanner? */
export function deviceTakesUsbFingerprints(target: Reported | null | undefined): boolean {
  return majorFor(target, BIO.finger) === USB_SCANNER_FP_VERSION;
}

/** ZKTeco finger numbers (FID / No): 0 is the left little finger through 9, the right little finger. */
export const ZK_FINGERS = [
  "left_little", "left_ring", "left_middle", "left_index", "left_thumb",
  "right_thumb", "right_index", "right_middle", "right_ring", "right_little",
] as const;
export const fingerName = (fid: number): string | null => ZK_FINGERS[fid] ?? null;
export const fingerNo = (name: string | null | undefined): number | null => {
  const i = (ZK_FINGERS as readonly string[]).indexOf(name ?? "");
  return i >= 0 ? i : null;
};

/* ── Member sync plan ─────────────────────────────────────────────────── */

export type MemberWant = { pin: string; name: string };

/**
 * What to send so the devices match WorshipHQ for these people. `want` is who should be on the devices now
 * (personId to pin and name), `had` is what was last sent. Deletes come first, so a number that moved from one
 * person to another is wiped (with the old person's face and fingers) before the new person is added.
 */
export function planMemberSync(want: Map<string, MemberWant>, had: Map<string, MemberWant>, scope: Iterable<string>) {
  const deletes = new Set<string>();
  const updates: { personId: string; pin: string; name: string; pinChanged: boolean }[] = [];
  const remove: string[] = [];
  const save: { personId: string; pin: string; name: string }[] = [];
  for (const id of new Set(scope)) {
    const w = want.get(id);
    const h = had.get(id);
    if (h && (!w || w.pin !== h.pin)) deletes.add(h.pin);
    if (!w) { if (h) remove.push(id); continue; }
    if (!h || h.pin !== w.pin || h.name !== w.name) {
      updates.push({ personId: id, pin: w.pin, name: w.name, pinChanged: !h || h.pin !== w.pin });
      save.push({ personId: id, pin: w.pin, name: w.name });
    }
  }
  // A number that someone else now has is still deleted first (it clears the old person's face and fingers).
  const commands: QueuedCommand[] = [...[...deletes].map(deleteUserCommand), ...updates.map((u) => userInfoCommand(u.pin, u.name))];
  return { commands, updates, remove, save };
}

/**
 * Who should be on the devices: active members with a member number that nobody else in the church shares
 * (a shared number cannot be told apart at the door), and who are not locked by the plan's member limit.
 */
export function wantedMembers(
  people: { id: string; memberId: string | null; firstName: string; lastName: string; status: string }[],
  locked: ReadonlySet<string>,
): Map<string, MemberWant> {
  const uses = new Map<string, number>();
  for (const p of people) {
    const pin = devicePin(p.memberId);
    if (pin) uses.set(pin, (uses.get(pin) ?? 0) + 1);
  }
  const out = new Map<string, MemberWant>();
  for (const p of people) {
    const pin = devicePin(p.memberId);
    if (!pin || uses.get(pin) !== 1 || p.status !== "active" || locked.has(p.id)) continue;
    out.set(p.id, { pin, name: asciiName(`${p.firstName} ${p.lastName}`) || pin });
  }
  return out;
}

/* ── Queue coalescing ─────────────────────────────────────────────────── */

const pinOfKey = (key: string | null) => (key && /^[udt]:/.test(key) ? key.split(":")[1] : null);

/**
 * Merge new commands into a device's unsent queue without sending the same thing twice:
 *  - adding or renaming a member (u:PIN) rewrites their unsent update in place, unless a delete for that number
 *    is queued after it, in which case the new update goes to the end;
 *  - deleting a member (d:PIN) drops every unsent command for that number (update, delete, registrations), then
 *    queues one delete at the end;
 *  - a registration (t:PIN:type:no:index) rewrites the same unsent registration in place, the same way.
 * Order is kept: commands go out oldest first, so a member always reaches a device before their registrations.
 */
export function coalesce(existing: { id: number; key: string | null }[], incoming: QueuedCommand[]) {
  type Slot = { id?: number; key: string | null; body?: string; dirty?: boolean; dropped?: boolean };
  const q: Slot[] = [...existing].sort((a, b) => a.id - b.id).map((e) => ({ id: e.id, key: e.key }));
  for (const c of incoming) {
    const pin = pinOfKey(c.key);
    if (c.key.startsWith("d:")) {
      for (const s of q) if (!s.dropped && pin !== null && pinOfKey(s.key) === pin) s.dropped = true;
      q.push({ key: c.key, body: c.body, dirty: true });
      continue;
    }
    let at = -1;
    for (let i = q.length - 1; i >= 0; i--) {
      const s = q[i];
      if (s.dropped || !s.key) continue;
      if (pin !== null && s.key === `d:${pin}`) break;
      if (s.key === c.key) { at = i; break; }
    }
    if (at >= 0) { q[at].body = c.body; q[at].dirty = true; }
    else q.push({ key: c.key, body: c.body, dirty: true });
  }
  return {
    dropIds: q.filter((s) => s.dropped && s.id !== undefined).map((s) => s.id!),
    rewrite: q.filter((s) => !s.dropped && s.id !== undefined && s.dirty).map((s) => ({ id: s.id!, body: s.body! })),
    insert: q.filter((s) => !s.dropped && s.id === undefined).map((s) => ({ key: s.key!, body: s.body! })),
  };
}

/** The key of a command already in the queue from before keys were kept, read from its text. */
export function keyFromBody(body: string): string | null {
  const u = /^DATA UPDATE USERINFO PIN=(\d+)\t/.exec(body);
  if (u) return `u:${u[1]}`;
  const d = /^DATA DELETE USERINFO PIN=(\d+)$/.exec(body);
  if (d) return `d:${d[1]}`;
  return null;
}

/** The options a device gets when it says hello. */
export function deviceOptions(sn: string): string {
  return [
    `GET OPTION FROM: ${sn}`,
    "ErrorDelay=60",
    // How often the device asks "anything for me?" (seconds). Scans are pushed the moment they happen (Realtime=1),
    // so this only affects how fast member changes arrive. Every 10 seconds would cost about 260,000 function calls
    // a month per device; every 2 minutes costs about 21,000.
    "Delay=120",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    // Upload scans, the operation log, and new or changed users, fingerprints and faces as they are registered.
    "TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFACE",
    "Realtime=1",
    "Encrypt=0",
    // Newer firmware: post these settings back (to /iclock/cdata?table=options), so we know its algorithm versions.
    "PushOptionsFlag=1",
    "PushOptions=FingerFunOn,FaceFunOn,FPVersion,FaceVersion,PvFunOn,PvVersion,MultiBioDataSupport,MultiBioVersion,UserCount,FPCount,FaceCount",
  ].join("\n");
}
