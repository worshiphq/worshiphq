import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { serviceDue } from "@/lib/fleet/due";
import { bumpOdometer } from "@/lib/fleet/service";
import { postExpense, round2, safeRevalidate, LinkError, type Ctx, type Tx } from "@/lib/expenses/post";
import { createRequest } from "@/lib/expenses/requests";

export type Result = { ok: true; id: string } | { ok: false; error: string };

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "urgent", label: "Urgent" },
] as const;
export const REQUEST_STATUSES = [
  { key: "open", label: "Open" },
  { key: "assigned", label: "Assigned" },
  { key: "in-progress", label: "In progress" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
] as const;
const PRIORITY_KEYS: string[] = PRIORITIES.map((p) => p.key);
const STATUS_KEYS: string[] = REQUEST_STATUSES.map((s) => s.key);

const validDate = (d: Date | null | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
const posInt = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null);

async function assetWithVehicle(churchId: string, assetId: string) {
  return db.asset.findFirst({ where: { id: assetId, churchId }, select: { id: true, name: true, vehicle: { select: { id: true, odometerKm: true, regNumber: true } } } });
}

export type ScheduleInput = { id?: string | null; assetId: string; title: string; everyDays?: number | null; everyKm?: number | null; lastDoneAt?: Date | null; lastDoneKm?: number | null; notes?: string | null; active?: boolean };

export async function saveSchedule(ctx: Ctx, input: ScheduleInput): Promise<Result> {
  const title = input.title?.trim().slice(0, 120);
  if (!title) return { ok: false, error: "Say what the service is (for example Engine oil)." };
  const asset = await assetWithVehicle(ctx.churchId, input.assetId);
  if (!asset) return { ok: false, error: "That item was not found." };
  const everyDays = posInt(input.everyDays), everyKm = asset.vehicle ? posInt(input.everyKm) : null;
  if (!everyDays && !everyKm) return { ok: false, error: asset.vehicle ? "Set how often: every so many days, or every so many km." : "Set how often, in days." };
  const lastDoneAt = validDate(input.lastDoneAt);
  const lastDoneKm = posInt(input.lastDoneKm) ?? (everyKm ? asset.vehicle?.odometerKm ?? null : null);
  const due = serviceDue({ everyDays, everyKm, lastDoneAt: lastDoneAt ?? new Date(), lastDoneKm }, asset.vehicle?.odometerKm ?? null);
  const data = { title, everyDays, everyKm, lastDoneAt, lastDoneKm, nextDueAt: due.dueAt, nextDueKm: due.dueKm, notes: input.notes?.trim() || null, active: input.active ?? true };
  let id: string;
  if (input.id) {
    const own = await db.maintenanceSchedule.findFirst({ where: { id: input.id, churchId: ctx.churchId, assetId: asset.id }, select: { id: true } });
    if (!own) return { ok: false, error: "That schedule was not found." };
    await db.maintenanceSchedule.update({ where: { id: own.id }, data: { ...data, alertedFor: null } });
    id = own.id;
  } else {
    id = (await db.maintenanceSchedule.create({ data: { churchId: ctx.churchId, assetId: asset.id, ...data }, select: { id: true } })).id;
  }
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: input.id ? "update" : "create", entity: "maintenanceSchedule", entityId: id, detail: `${title} for ${asset.name}` });
  safeRevalidate("/app/maintenance", `/app/assets/${asset.id}`, ...(asset.vehicle ? [`/app/vehicles/${asset.vehicle.id}`, "/app/vehicles"] : []));
  return { ok: true, id };
}

export type RecordInput = {
  assetId: string;
  scheduleId?: string | null;
  requestId?: string | null;
  kind?: "service" | "repair" | "inspection" | string | null;
  title: string;
  date?: Date | null;
  odometerKm?: number | null;
  vendorName?: string | null;
  vendorId?: string | null;
  cost?: number | null;
  notes?: string | null;
  /** Post the cost: as an expense when allowed, otherwise as a request to finance. */
  record?: boolean;
  accountId?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
};

export type RecordResult = { ok: true; id: string; posted: "expense" | "request" | "none" } | { ok: false; error: string };

/** Log a service or repair: rolls its schedule forward, moves the odometer, and posts the cost. */
export async function logRecord(ctx: Ctx, input: RecordInput): Promise<RecordResult> {
  const title = input.title?.trim().slice(0, 160);
  if (!title) return { ok: false, error: "Say what was done." };
  const asset = await assetWithVehicle(ctx.churchId, input.assetId);
  if (!asset) return { ok: false, error: "That item was not found." };
  const schedule = input.scheduleId ? await db.maintenanceSchedule.findFirst({ where: { id: input.scheduleId, churchId: ctx.churchId, assetId: asset.id } }) : null;
  if (input.scheduleId && !schedule) return { ok: false, error: "That schedule was not found." };
  let vendorId: string | null = null, vendorName = input.vendorName?.trim() || null;
  if (input.vendorId) {
    const v = await db.vendor.findFirst({ where: { id: input.vendorId, churchId: ctx.churchId }, select: { id: true, name: true } });
    if (!v) return { ok: false, error: "That payee was not found." };
    vendorId = v.id;
    vendorName = vendorName ?? v.name;
  }
  const requestId = input.requestId ? (await db.maintenanceRequest.findFirst({ where: { id: input.requestId, churchId: ctx.churchId }, select: { id: true } }))?.id ?? null : null;
  // A repair logged late may carry an older reading: it is kept on the record, and bumpOdometer never moves the odometer back.
  const odometerKm = asset.vehicle ? posInt(input.odometerKm) : null;
  const date = validDate(input.date) ?? new Date();
  const cost = input.cost != null && input.cost > 0 ? round2(input.cost) : null;
  const kind = input.kind === "repair" || input.kind === "inspection" ? input.kind : "service";
  const recordData = { churchId: ctx.churchId, assetId: asset.id, scheduleId: schedule?.id ?? null, requestId, kind, title, date, odometerKm, vendorName, vendorId, cost, notes: input.notes?.trim() || null, createdById: ctx.userId };

  const afterRecord = async (tx: Tx, recordId: string) => {
    if (schedule) {
      const due = serviceDue({ everyDays: schedule.everyDays, everyKm: schedule.everyKm, lastDoneAt: date, lastDoneKm: odometerKm ?? schedule.lastDoneKm }, odometerKm ?? asset.vehicle?.odometerKm ?? null);
      await tx.maintenanceSchedule.update({ where: { id: schedule.id }, data: { lastDoneAt: date, lastDoneKm: odometerKm ?? schedule.lastDoneKm, nextDueAt: due.dueAt, nextDueKm: due.dueKm, alertedFor: null } });
    }
    if (asset.vehicle) await bumpOdometer(tx, asset.vehicle.id, odometerKm);
    return recordId;
  };
  const description = `${kind === "repair" ? "Repair" : kind === "inspection" ? "Inspection" : "Service"}: ${asset.vehicle ? asset.vehicle.regNumber : asset.name}, ${title}`;

  if (cost && input.record && ctx.canPostExpenses) {
    let recordId = "";
    const res = await postExpense(ctx, {
      description, amount: cost, category: asset.vehicle ? "Transport" : "Maintenance", date, vendor: vendorName, vendorId,
      accountId: input.accountId, paymentMethod: input.paymentMethod, receiptUrl: input.receiptUrl, assetId: asset.id, source: "maintenance",
    }, async (tx, expenseId) => {
      const row = await tx.maintenanceRecord.create({ data: { ...recordData, expenseId }, select: { id: true } });
      recordId = row.id;
      await tx.expense.update({ where: { id: expenseId }, data: { sourceId: row.id } });
      await afterRecord(tx, row.id);
    });
    if (!res.ok) return res;
    revalidateFor(asset);
    return { ok: true, id: recordId, posted: "expense" };
  }

  const out = await db.$transaction(async (tx) => {
    const row = await tx.maintenanceRecord.create({ data: recordData, select: { id: true } });
    await afterRecord(tx, row.id);
    if (cost && input.record) {
      const r = await createRequest(ctx, { description, amount: cost, category: asset.vehicle ? "Transport" : "Maintenance", vendorName, vendorId, accountId: input.accountId, assetId: asset.id, attachmentUrl: input.receiptUrl, source: "maintenance", sourceId: row.id }, tx);
      if (!r.ok) throw new LinkError(r.error);
    }
    return row.id;
  }).catch((e) => (e instanceof LinkError ? { error: e.message } : Promise.reject(e)));
  if (typeof out !== "string") return { ok: false, error: out.error };
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "maintenanceRecord", entityId: out, detail: description });
  revalidateFor(asset);
  return { ok: true, id: out, posted: cost && input.record ? "request" : "none" };
}

function revalidateFor(asset: { id: string; vehicle: { id: string } | null }) {
  safeRevalidate("/app/maintenance", "/app/assets", `/app/assets/${asset.id}`, "/app/expenses", ...(asset.vehicle ? ["/app/vehicles", `/app/vehicles/${asset.vehicle.id}`] : []));
}

export type ProblemInput = { title: string; description?: string | null; location?: string | null; facilityId?: string | null; assetId?: string | null; priority?: string | null; photoUrl?: string | null };

/** Anyone on the team can report a fault. */
export async function reportProblem(ctx: Ctx, input: ProblemInput): Promise<Result> {
  const title = input.title?.trim().slice(0, 160);
  if (!title) return { ok: false, error: "Say what is wrong." };
  let facilityId: string | null = null, assetId: string | null = null;
  if (input.facilityId) {
    facilityId = (await db.facility.findFirst({ where: { id: input.facilityId, churchId: ctx.churchId }, select: { id: true } }))?.id ?? null;
    if (!facilityId) return { ok: false, error: "That room was not found." };
  }
  if (input.assetId) {
    assetId = (await db.asset.findFirst({ where: { id: input.assetId, churchId: ctx.churchId }, select: { id: true } }))?.id ?? null;
    if (!assetId) return { ok: false, error: "That item was not found." };
  }
  const row = await db.maintenanceRequest.create({
    data: {
      churchId: ctx.churchId, title, description: input.description?.trim() || null, location: input.location?.trim() || null,
      facilityId, assetId, priority: input.priority && PRIORITY_KEYS.includes(input.priority) ? input.priority : "normal",
      photoUrl: input.photoUrl || null, reportedById: ctx.userId, reportedByName: ctx.name,
    },
    select: { id: true },
  });
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "create", entity: "maintenanceRequest", entityId: row.id, detail: `Reported: ${title}` });
  safeRevalidate("/app/maintenance");
  return { ok: true, id: row.id };
}

export type RequestUpdate = { status?: string | null; priority?: string | null; assigneeUserId?: string | null; assigneeName?: string | null; vendorId?: string | null; dueDate?: Date | null; estimatedCost?: number | null };

export async function updateRequest(ctx: Ctx, id: string, input: RequestUpdate): Promise<Result> {
  const req = await db.maintenanceRequest.findFirst({ where: { id, churchId: ctx.churchId }, select: { id: true, title: true, status: true, assigneeUserId: true } });
  if (!req) return { ok: false, error: "That request was not found." };
  let assigneeUserId: string | null | undefined = undefined;
  if (input.assigneeUserId !== undefined) {
    if (input.assigneeUserId) {
      assigneeUserId = (await db.user.findFirst({ where: { id: input.assigneeUserId, churchId: ctx.churchId }, select: { id: true } }))?.id ?? null;
      if (!assigneeUserId) return { ok: false, error: "That team member was not found." };
    } else assigneeUserId = null;
  }
  let vendorId: string | null | undefined = undefined;
  if (input.vendorId !== undefined) {
    if (input.vendorId) {
      vendorId = (await db.vendor.findFirst({ where: { id: input.vendorId, churchId: ctx.churchId }, select: { id: true } }))?.id ?? null;
      if (!vendorId) return { ok: false, error: "That payee was not found." };
    } else vendorId = null;
  }
  let status = input.status && STATUS_KEYS.includes(input.status) && input.status !== "done" ? input.status : undefined;
  if (!status && req.status === "open" && (assigneeUserId || input.assigneeName?.trim())) status = "assigned";
  await db.maintenanceRequest.update({
    where: { id: req.id },
    data: {
      ...(status ? { status } : {}),
      ...(input.priority && PRIORITY_KEYS.includes(input.priority) ? { priority: input.priority } : {}),
      ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
      ...(input.assigneeName !== undefined ? { assigneeName: input.assigneeName?.trim() || null } : {}),
      ...(vendorId !== undefined ? { vendorId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: validDate(input.dueDate) } : {}),
      ...(input.estimatedCost !== undefined ? { estimatedCost: input.estimatedCost && input.estimatedCost > 0 ? round2(input.estimatedCost) : null } : {}),
    },
  });
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "maintenanceRequest", entityId: req.id, detail: `Updated "${req.title}"${status ? ` (${status})` : ""}` });
  safeRevalidate("/app/maintenance");
  return { ok: true, id: req.id };
}

export type CompleteInput = { actualCost?: number | null; resolution?: string | null; record?: boolean; accountId?: string | null; paymentMethod?: string | null; receiptUrl?: string | null };

/** Close a request. With an item linked, a repair record is kept on its history; the cost is posted or sent for approval. */
export async function completeRequest(ctx: Ctx, id: string, input: CompleteInput): Promise<RecordResult> {
  const req = await db.maintenanceRequest.findFirst({ where: { id, churchId: ctx.churchId }, include: { vendor: { select: { name: true } } } });
  if (!req) return { ok: false, error: "That request was not found." };
  if (req.status === "done") return { ok: false, error: "This request is already done." };
  const cost = input.actualCost != null && input.actualCost > 0 ? round2(input.actualCost) : null;
  const claim = await db.maintenanceRequest.updateMany({
    where: { id, churchId: ctx.churchId, status: { not: "done" } },
    data: { status: "done", resolvedAt: new Date(), actualCost: cost, resolution: input.resolution?.trim() || null },
  });
  if (claim.count === 0) return { ok: false, error: "This request is already done." };

  let posted: "expense" | "request" | "none" = "none";
  if (req.assetId) {
    const r = await logRecord(ctx, {
      assetId: req.assetId, requestId: req.id, kind: "repair", title: req.title, cost, notes: input.resolution,
      vendorName: req.assigneeName ?? req.vendor?.name ?? null, vendorId: req.vendorId,
      record: input.record, accountId: input.accountId, paymentMethod: input.paymentMethod, receiptUrl: input.receiptUrl,
    });
    if (!r.ok) {
      await db.maintenanceRequest.updateMany({ where: { id, churchId: ctx.churchId }, data: { status: req.status, resolvedAt: null } });
      return r;
    }
    posted = r.posted;
    if (posted === "expense") {
      const rec = await db.maintenanceRecord.findFirst({ where: { id: r.id, churchId: ctx.churchId }, select: { expenseId: true } });
      if (rec?.expenseId) await db.maintenanceRequest.updateMany({ where: { id, churchId: ctx.churchId }, data: { expenseId: rec.expenseId } });
    }
  } else if (cost && input.record) {
    const description = `Repair: ${req.title}${req.location ? ` (${req.location})` : ""}`;
    if (ctx.canPostExpenses) {
      const res = await postExpense(ctx, {
        description, amount: cost, category: "Maintenance", vendor: req.assigneeName ?? req.vendor?.name ?? null, vendorId: req.vendorId,
        accountId: input.accountId, paymentMethod: input.paymentMethod, receiptUrl: input.receiptUrl, source: "repair", sourceId: req.id,
      }, async (tx, expenseId) => { await tx.maintenanceRequest.update({ where: { id: req.id }, data: { expenseId } }); });
      if (!res.ok) {
        await db.maintenanceRequest.updateMany({ where: { id, churchId: ctx.churchId }, data: { status: req.status, resolvedAt: null } });
        return res;
      }
      posted = "expense";
    } else {
      const r = await createRequest(ctx, { description, amount: cost, category: "Maintenance", vendorName: req.assigneeName, vendorId: req.vendorId, accountId: input.accountId, attachmentUrl: input.receiptUrl, source: "repair", sourceId: req.id });
      if (!r.ok) return r;
      posted = "request";
    }
  }
  await logAudit({ churchId: ctx.churchId, userId: ctx.userId, action: "update", entity: "maintenanceRequest", entityId: req.id, detail: `Done: "${req.title}"${cost ? `, GHS ${cost}` : ""}` });
  safeRevalidate("/app/maintenance", "/app/expenses");
  return { ok: true, id: req.id, posted };
}
