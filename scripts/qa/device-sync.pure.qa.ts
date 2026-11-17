/**
 * Pure tests for device sync: reading uploads, building commands, version rules, the member plan and queue coalescing.
 * No database, no server-only imports.
 *   npx tsx scripts/qa/device-sync.pure.qa.ts
 */
import assert from "node:assert/strict";
import {
  BIO, asciiName, canCopyTemplate, coalesce, deleteFingerCommand, deleteUserCommand, deviceOptions, devicePin,
  deviceTakesUsbFingerprints, fingerName, fingerNo, keyFromBody, majorFor, mergeReported, parseInfoParam, parseOptions,
  parseTemplateLines, planMemberSync, sharesWithUsbScanner, templateCommand, userInfoCommand, wantedMembers,
  type MemberWant, type StoredTemplate,
} from "../../src/lib/devices/protocol";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

const TMP = "TVNTUzIxAAAEWl0ECAUHCc7QAAAcW2kBAAAAhA8z+lo=";

// ── Uploads ──
test("legacy FP line from OPERLOG", () => {
  const body = `OPLOG 4\t0\t2026-11-15 08:01:02\t0\t0\t0\t0\nFP PIN=42\tFID=6\tSize=${TMP.length}\tValid=1\tTMP=${TMP}\nUSER PIN=42\tName=Ama Mensah\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=\n`;
  const t = parseTemplateLines(body, "OPERLOG");
  assert.equal(t.length, 1);
  assert.deepEqual({ ...t[0] }, { source: "FP", pin: "42", bioType: 1, no: 6, index: 0, majorVer: null, minorVer: null, format: 0, data: TMP, size: TMP.length, valid: true });
});

test("legacy FACE lines (several templates per person)", () => {
  const body = `FACE PIN=7\tFID=0\tSize=8\tValid=1\tTMP=QUJDRA==\r\nFACE PIN=7\tFID=1\tSize=8\tValid=1\tTMP=RUZHSA==\r\n`;
  const t = parseTemplateLines(body, "OPERLOG");
  assert.equal(t.length, 2);
  assert.equal(t[1].bioType, BIO.face);
  assert.equal(t[1].index, 1);
  assert.equal(t[1].no, 0);
});

test("BIODATA lines (visible-light face, palm, finger), keys in any case", () => {
  const body = [
    `BIODATA Pin=12\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=39\tMinorVer=1\tFormat=0\tTmp=${TMP}`,
    `BIODATA Pin=12\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=8\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=${TMP}`,
    `BIODATA PIN=12\tNO=3\tINDEX=0\tVALID=1\tDURESS=0\tTYPE=1\tMAJORVER=10\tMINORVER=0\tFORMAT=0\tTMP=${TMP}`,
  ].join("\n");
  const t = parseTemplateLines(body, "BIODATA");
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => [x.bioType, x.majorVer, x.no]), [[9, 39, 0], [8, 12, 0], [1, 10, 3]]);
  assert.equal(t[0].minorVer, 1);
});

test("BIODATA table without the line prefix", () => {
  const t = parseTemplateLines(`Pin=5\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=2\tMajorVer=7\tMinorVer=0\tFormat=0\tTmp=${TMP}`, "BIODATA");
  assert.equal(t.length, 1);
  assert.equal(t[0].majorVer, 7);
});

test("bad lines are skipped: non-numeric PIN, bad base64, finger out of range, huge data, Valid=0 kept but marked", () => {
  const body = [
    `FP PIN=AB\tFID=1\tValid=1\tTMP=${TMP}`,
    `FP PIN=1\tFID=1\tValid=1\tTMP=not base64!`,
    `FP PIN=1\tFID=12\tValid=1\tTMP=${TMP}`,
    `FP PIN=1\tFID=1\tValid=1\tTMP=${"A".repeat(200_000)}`,
    `FP PIN=1\tFID=2\tValid=0\tTMP=${TMP}`,
    `FP PIN=1\tFID=3\tValid=1\tTMP=${TMP}\tExtra=a\tb`,
  ].join("\n");
  const t = parseTemplateLines(body, "OPERLOG");
  assert.deepEqual(t.map((x) => [x.no, x.valid]), [[2, false], [3, true]]);
});

test("leading zeros in a PIN are dropped (0042 is 42)", () => {
  assert.equal(parseTemplateLines(`FP PIN=0042\tFID=1\tValid=1\tTMP=${TMP}`)[0].pin, "42");
});

// ── Commands ──
test("USERINFO command is tab separated and the name is cleaned", () => {
  const c = userInfoCommand("42", "Ámà\tMensah\nC:99:DATA DELETE");
  assert.equal(c.key, "u:42");
  assert.equal(c.body, "DATA UPDATE USERINFO PIN=42\tName=Ama Mensah C99DATA DELET\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=");
  assert.equal(c.body.split("\t").length, 9);
  assert.ok(!c.body.includes("\n"));
});

test("asciiName keeps plain letters, apostrophes, dots and hyphens, 24 characters", () => {
  assert.equal(asciiName("Kwame O'Neil-Asante Jr."), "Kwame O'Neil-Asante Jr.");
  assert.equal(asciiName("Adwoa Ñkansah Gyamfuaa Boateng"), "Adwoa Nkansah Gyamfuaa B");
  assert.equal(userInfoCommand("9", "日本").body.includes("Name=9\t"), true);
});

test("DELETE USERINFO", () => {
  assert.deepEqual(deleteUserCommand("42"), { key: "d:42", body: "DATA DELETE USERINFO PIN=42" });
});

const fp10: StoredTemplate = { pin: "42", bioType: 1, no: 6, index: 0, majorVer: 10, minorVer: 0, format: 0, data: TMP, size: null };

test("fingerprint to a legacy device is FINGERTMP, to a BIODATA device is BIODATA", () => {
  assert.equal(templateCommand(fp10, { fp: 10 })!.body, `DATA UPDATE FINGERTMP PIN=42\tFID=6\tSize=${TMP.length}\tValid=1\tTMP=${TMP}`);
  assert.equal(templateCommand(fp10, { fp: 10, biodata: true })!.body, `DATA UPDATE BIODATA Pin=42\tNo=6\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${TMP}`);
  assert.equal(templateCommand(fp10, { fp: 10 })!.key, "t:42:1:6:0");
});

test("face to a legacy device is FACE; palm only as BIODATA", () => {
  const face: StoredTemplate = { ...fp10, bioType: 2, no: 0, index: 3, majorVer: 7 };
  assert.match(templateCommand(face, { face: 7 })!.body, /^DATA UPDATE FACE PIN=42\tFID=3\t/);
  const palm: StoredTemplate = { ...fp10, bioType: 8, no: 0, majorVer: 12 };
  assert.equal(templateCommand(palm, { palm: 12 }), null);
  assert.match(templateCommand(palm, { palm: 12, biodata: true })!.body, /Type=8\tMajorVer=12/);
});

test("a template with bad data never becomes a command", () => {
  assert.equal(templateCommand({ ...fp10, data: "abc\tPIN=1" }, { fp: 10 }), null);
});

test("delete one finger", () => {
  assert.equal(deleteFingerCommand("42", 6, { fp: 10 }).body, "DATA DELETE FINGERTMP PIN=42\tFID=6");
  assert.equal(deleteFingerCommand("42", 6, { fp: 10, biodata: true }).body, "DATA DELETE BIODATA Pin=42\tType=1\tNo=6");
  assert.equal(deleteFingerCommand("42", 6, null).key, "t:42:1:6:0");
});

test("options ask the device for registrations and its versions", () => {
  const o = deviceOptions("ABC123");
  assert.match(o, /^GET OPTION FROM: ABC123\n/);
  assert.match(o, /TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFACE/);
  assert.match(o, /PushOptionsFlag=1/);
});

// ── What devices report ──
test("INFO parameter", () => {
  const r = parseInfoParam("Ver 8.0.4.2-20190101,12,20,345,192.168.1.201,10,7,24,0,111");
  assert.deepEqual(r, { firmware: "Ver 8.0.4.2-20190101", users: 12, fingers: 20, fp: 10, face: 7, faces: 24 });
  assert.deepEqual(parseInfoParam("Ver 6.60,5,0,9,10.0.0.2,0,0,0"), { firmware: "Ver 6.60", users: 5, fingers: 0, faces: 0 });
});

test("options body (commas or new lines, ~ prefix, MultiBio lists by type)", () => {
  const r = parseOptions("~DeviceName=SpeedFace-V5L,FPVersion=10,FaceVersion=0,PvVersion=12.0\nUserCount=150\nMultiBioDataSupport=0:1:0:0:0:0:0:0:1:1\nMultiBioVersion=0:10.0:0:0:0:0:0:0:12.0:39.1");
  assert.equal(r.fp, 10);
  assert.equal(r.face, undefined);
  assert.equal(r.palm, 12);
  assert.deepEqual(r.bio, { "1": 10, "8": 12, "9": 39 });
  assert.equal(r.biodata, true);
  assert.equal(r.users, 150);
  assert.equal(r.model, "SpeedFace-V5L");
  assert.equal(parseOptions("ID=4&Return=0&CMD=INFO\n~ZKFPVersion=10").fp, 10);
});

test("reports merge field by field", () => {
  const m = mergeReported({ fp: 10, users: 3, bio: { "9": 39 } }, { users: 4, bio: { "1": 10 } });
  assert.deepEqual(m, { fp: 10, users: 4, bio: { "9": 39, "1": 10 } });
});

// ── Version rules ──
test("copy only between the same known major version", () => {
  assert.equal(canCopyTemplate({ bioType: 1, majorVer: 10 }, { fp: 10 }), true);
  assert.equal(canCopyTemplate({ bioType: 1, majorVer: 10 }, { fp: 12 }), false);
  assert.equal(canCopyTemplate({ bioType: 1, majorVer: 10 }, {}), false, "unknown target");
  assert.equal(canCopyTemplate({ bioType: 1, majorVer: 10 }, null), false);
  assert.equal(canCopyTemplate({ bioType: 1, majorVer: null }, { fp: 10 }), false, "unknown source");
  assert.equal(canCopyTemplate({ bioType: 9, majorVer: 39 }, { bio: { "9": 39 } }), true);
  assert.equal(canCopyTemplate({ bioType: 9, majorVer: 39 }, { vlFace: 39 }), false, "visible-light face needs BIODATA");
  assert.equal(canCopyTemplate({ bioType: 9, majorVer: 39 }, { bio: { "9": 40 } }), false);
  assert.equal(canCopyTemplate({ bioType: 2, majorVer: 7 }, { face: 7 }), true);
  assert.equal(canCopyTemplate({ bioType: 8, majorVer: 12 }, { palm: 12 }), false, "palm needs BIODATA");
});

test("majorFor prefers MultiBioVersion", () => {
  assert.equal(majorFor({ fp: 10, bio: { "1": 12 } }, 1), 12);
  assert.equal(majorFor({ palm: 12 }, BIO.palmPrint), 12);
});

test("USB scanner sharing is fingerprint version 10, ZKTeco format, only", () => {
  assert.equal(sharesWithUsbScanner({ bioType: 1, majorVer: 10, format: 0 }), true);
  assert.equal(sharesWithUsbScanner({ bioType: 1, majorVer: 12, format: 0 }), false);
  assert.equal(sharesWithUsbScanner({ bioType: 1, majorVer: 10, format: 1 }), false, "ISO format");
  assert.equal(sharesWithUsbScanner({ bioType: 9, majorVer: 10 }), false);
  assert.equal(deviceTakesUsbFingerprints({ fp: 10 }), true);
  assert.equal(deviceTakesUsbFingerprints({ fp: 12 }), false);
  assert.equal(deviceTakesUsbFingerprints({}), false);
});

test("finger numbers match the USB scanner's finger names both ways", () => {
  assert.equal(fingerName(0), "left_little");
  assert.equal(fingerName(6), "right_index");
  assert.equal(fingerName(10), null);
  for (let i = 0; i < 10; i++) assert.equal(fingerNo(fingerName(i)), i);
  assert.equal(fingerNo("thumb"), null);
});

// ── Members ──
test("devicePin", () => {
  assert.equal(devicePin("GBC-0042"), "42");
  assert.equal(devicePin("0000"), null);
  assert.equal(devicePin("ABC"), null);
  assert.equal(devicePin(null), null);
});

const person = (id: string, memberId: string | null, status = "active") => ({ id, memberId, firstName: id.toUpperCase(), lastName: "Doe", status });

test("wanted members: active, numbered, unique number, not locked", () => {
  const want = wantedMembers([person("a", "X-0001"), person("b", "X-0002", "inactive"), person("c", null), person("d", "X-0003"), person("e", "Y-3"), person("f", "X-0004")], new Set(["f"]));
  assert.deepEqual([...want.keys()], ["a"]);
  assert.deepEqual(want.get("a"), { pin: "1", name: "A Doe" });
});

const M = (pin: string, name = `P${pin}`): MemberWant => ({ pin, name });

test("plan: add, rename, renumber, remove", () => {
  const want = new Map([["a", M("1")], ["b", M("2", "New")], ["c", M("9")]]);
  const had = new Map([["b", M("2", "Old")], ["c", M("3")], ["d", M("4")]]);
  const p = planMemberSync(want, had, ["a", "b", "c", "d"]);
  assert.deepEqual(p.commands.map((c) => c.key), ["d:3", "d:4", "u:1", "u:2", "u:9"]);
  assert.deepEqual(p.updates.map((u) => [u.personId, u.pinChanged]), [["a", true], ["b", false], ["c", true]]);
  assert.deepEqual(p.remove, ["d"]);
});

test("plan: nothing changes, nothing is sent", () => {
  const want = new Map([["a", M("1")]]);
  const p = planMemberSync(want, new Map(want), ["a"]);
  assert.equal(p.commands.length, 0);
});

test("plan: a number moving to someone else is deleted first, then added", () => {
  const p = planMemberSync(new Map([["b", M("5")]]), new Map([["a", M("5")]]), ["a", "b"]);
  assert.deepEqual(p.commands.map((c) => c.key), ["d:5", "u:5"]);
});

// ── Coalescing ──
const u = (pin: string, n = "x") => ({ key: `u:${pin}`, body: `U${pin}${n}` });
const d = (pin: string) => ({ key: `d:${pin}`, body: `D${pin}` });
const t = (pin: string, no = 1) => ({ key: `t:${pin}:1:${no}:0`, body: `T${pin}.${no}` });

test("the same member is not queued twice: the unsent update is rewritten in place", () => {
  const r = coalesce([{ id: 1, key: "u:5" }, { id: 2, key: "t:5:1:1:0" }], [u("5", "renamed")]);
  assert.deepEqual(r, { dropIds: [], rewrite: [{ id: 1, body: "U5renamed" }], insert: [] });
});

test("a delete drops everything unsent for that number and queues one delete", () => {
  const r = coalesce([{ id: 1, key: "u:5" }, { id: 2, key: "t:5:1:1:0" }, { id: 3, key: "u:6" }, { id: 4, key: "d:5" }], [d("5")]);
  assert.deepEqual(r.dropIds, [1, 2, 4]);
  assert.deepEqual(r.insert, [d("5")]);
});

test("an update after a queued delete goes after it (never before)", () => {
  const r = coalesce([{ id: 1, key: "u:5" }, { id: 2, key: "d:5" }], [u("5")]);
  assert.deepEqual(r, { dropIds: [], rewrite: [], insert: [u("5")] });
});

test("within one batch: delete then add stays in that order, duplicates merge", () => {
  const r = coalesce([], [u("5", "a"), d("5"), u("5", "b"), u("5", "c"), t("5"), t("5")]);
  assert.deepEqual(r.insert, [d("5"), u("5", "c"), t("5")]);
});

test("registrations for other numbers or fingers are kept", () => {
  const r = coalesce([{ id: 1, key: "t:5:1:1:0" }, { id: 2, key: "t:5:1:2:0" }], [t("5", 2), t("6", 1)]);
  assert.deepEqual(r, { dropIds: [], rewrite: [{ id: 2, body: "T5.2" }], insert: [t("6", 1)] });
});

test("old queue rows without a key are read from their text", () => {
  assert.equal(keyFromBody("DATA UPDATE USERINFO PIN=42\tName=A"), "u:42");
  assert.equal(keyFromBody("DATA DELETE USERINFO PIN=42"), "d:42");
  assert.equal(keyFromBody("INFO"), null);
  const r = coalesce([{ id: 9, key: keyFromBody("DATA UPDATE USERINFO PIN=42\tName=A") }, { id: 10, key: null }], [u("42")]);
  assert.deepEqual(r.rewrite, [{ id: 9, body: "U42x" }]);
});

test("INFO and queries coalesce by exact key", () => {
  const r = coalesce([{ id: 1, key: "info" }], [{ key: "info", body: "INFO" }, { key: "q:1", body: "DATA QUERY BIODATA Type=1" }]);
  assert.deepEqual(r.rewrite, [{ id: 1, body: "INFO" }]);
  assert.deepEqual(r.insert.map((x) => x.key), ["q:1"]);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
