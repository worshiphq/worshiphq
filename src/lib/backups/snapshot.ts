import "server-only";
import crypto from "crypto";
import zlib from "zlib";
import { promisify } from "util";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const MAGIC = Buffer.from("WHQB1");
const PAGE = 2000;

// Never exported: the backup of backups, plus anything that is a credential.
const EXCLUDE_MODELS = new Set(["ChurchBackup", "BiometricCredential", "PhoneVerification"]);
const STRIP_FIELDS: Record<string, string[]> = { User: ["passwordHash", "inviteToken"] };

export type DModel = (typeof Prisma.dmmf.datamodel.models)[number];
export const MODELS = Prisma.dmmf.datamodel.models;
export const BY_NAME = new Map(MODELS.map((m) => [m.name, m]));

export function backupKeyReady(): boolean {
  return !!env.BACKUP_ENCRYPTION_KEY && Buffer.from(env.BACKUP_ENCRYPTION_KEY, "base64").length === 32;
}

/** Prisma `where` that selects only this church's rows, following relations
 *  for child tables that carry no churchId of their own. Null = not church data. */
export function whereFor(model: DModel, churchId: string, trail: Set<string> = new Set()): Record<string, unknown> | null {
  if (model.name === "Church") return { id: churchId };
  if (model.fields.some((f) => f.name === "churchId" && f.kind === "scalar")) return { churchId };
  if (trail.size >= 3) return null;
  const next = new Set(trail).add(model.name);
  const owning = model.fields
    .filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0 && !next.has(f.type))
    .sort((a, b) => Number(b.isRequired) - Number(a.isRequired));
  for (const f of owning) {
    const target = BY_NAME.get(f.type);
    if (!target) continue;
    const inner = whereFor(target, churchId, next);
    if (inner) return { [f.name]: inner };
  }
  return null;
}

export function replacer(_k: string, v: unknown) {
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && (v as { type?: string }).type === "Buffer" && Array.isArray((v as { data?: number[] }).data)) {
    return { __bytes: Buffer.from((v as { data: number[] }).data).toString("base64") };
  }
  return v;
}

export function delegate(model: string) {
  return (db as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[
    model.charAt(0).toLowerCase() + model.slice(1)
  ];
}

export async function readTable(model: DModel, where: Record<string, unknown>) {
  const d = delegate(model.name);
  const idField = model.fields.find((f) => f.isId)?.name;
  if (!idField) return d.findMany({ where });
  const rows: Record<string, unknown>[] = [];
  let cursor: unknown;
  for (;;) {
    const page = await d.findMany({
      where,
      orderBy: { [idField]: "asc" },
      take: PAGE,
      ...(cursor !== undefined ? { cursor: { [idField]: cursor }, skip: 1 } : {}),
    });
    rows.push(...page);
    if (page.length < PAGE) break;
    cursor = page[page.length - 1][idField];
  }
  return rows;
}

export async function buildSnapshot(churchId: string): Promise<{ data: Buffer; rowCount: number; tables: number }> {
  const church = await db.church.findUnique({ where: { id: churchId }, select: { name: true, slug: true } });
  const skipped: string[] = [];
  const jobs: { model: DModel; where: Record<string, unknown> }[] = [];
  for (const model of MODELS) {
    if (EXCLUDE_MODELS.has(model.name)) continue;
    const where = whereFor(model, churchId);
    if (where) jobs.push({ model, where });
    else skipped.push(model.name);
  }

  // Read tables a few at a time: each is a network round trip, so sequential is slow.
  const results: (string | null)[] = new Array(jobs.length).fill(null);
  const counts: number[] = new Array(jobs.length).fill(0);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        const { model, where } = jobs[i];
        let rows = await readTable(model, where);
        if (!rows.length) continue;
        const strip = STRIP_FIELDS[model.name];
        if (strip) rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !strip.includes(k))));
        counts[i] = rows.length;
        results[i] = `${JSON.stringify(model.name)}:${JSON.stringify(rows, replacer)}`;
      }
    }),
  );
  const parts = results.filter((r): r is string => r !== null);
  const rowCount = counts.reduce((a, b) => a + b, 0);

  const meta = {
    app: "WorshipHQ",
    format: 1,
    churchId,
    church: church?.name ?? null,
    slug: church?.slug ?? null,
    createdAt: new Date().toISOString(),
    rowCount,
    notIncluded: ["login passwords", "fingerprint data", "one-time codes", "member tags"],
    unscopedTablesSkipped: skipped,
  };
  const json = `{"meta":${JSON.stringify(meta)},"tables":{${parts.join(",")}}}`;
  return { data: Buffer.from(json, "utf8"), rowCount, tables: parts.length };
}

export async function seal(plain: Buffer): Promise<Buffer> {
  const key = Buffer.from(env.BACKUP_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY is missing or not a 32-byte base64 key.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(await gzip(plain)), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

export async function open(sealed: Buffer): Promise<Buffer> {
  const key = Buffer.from(env.BACKUP_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY is missing or not a 32-byte base64 key.");
  if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a WorshipHQ backup file.");
  const iv = sealed.subarray(5, 17);
  const tag = sealed.subarray(17, 33);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return gunzip(Buffer.concat([decipher.update(sealed.subarray(33)), decipher.final()]));
}
