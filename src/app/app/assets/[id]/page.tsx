import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getAssetDetail } from "@/lib/data/assets";
import { ctxFrom } from "@/lib/expenses/post";
import { AssetDetail } from "@/components/app/assets/asset-detail";

export const metadata = { title: "Asset" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireModule("assets");
  const { id } = await params;
  const detail = await getAssetDetail(session.churchId, id);
  if (!detail) notFound();
  const canWrite = canEdit(session, "assets");
  const ctx = ctxFrom(session);
  const [facilities, departments, accounts] = canWrite
    ? await Promise.all([
        db.facility.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.department.findMany({ where: { churchId: session.churchId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.churchAccount.findMany({ where: { churchId: session.churchId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }),
      ])
    : [[], [], []];
  const a = detail.asset;
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  return (
    <AssetDetail
      asset={{
        id: a.id, name: a.name, tagCode: a.tagCode, category: a.category, condition: a.condition, status: a.status, quantity: a.quantity,
        serialNo: a.serialNo, location: a.location, facilityId: a.facilityId, facilityName: a.facility?.name ?? null, departmentId: a.departmentId,
        departmentName: a.department?.name ?? null, custodian: a.custodian ? { id: a.custodian.id, name: `${a.custodian.firstName} ${a.custodian.lastName}`.trim(), phone: a.custodian.phone } : null,
        purchaseDate: iso(a.purchaseDate), purchasePrice: a.purchasePrice, supplier: a.supplier, warrantyExpires: iso(a.warrantyExpires),
        depreciation: a.depreciation, usefulLifeYears: a.usefulLifeYears, salvageValue: a.salvageValue, inServiceDate: iso(a.inServiceDate),
        notes: a.notes, photoUrl: a.photoUrl, disposedAt: iso(a.disposedAt), disposalMethod: a.disposalMethod, disposalAmount: a.disposalAmount,
        vehicleId: a.vehicle?.id ?? null, vehicleReg: a.vehicle?.regNumber ?? null, hasPurchaseExpense: !!detail.purchaseExpense,
      }}
      value={detail.value}
      book={detail.book}
      schedule={detail.schedule}
      timeline={detail.timeline}
      openCheckout={detail.openCheckout ? { borrowerName: detail.openCheckout.borrowerName, borrowerPhone: detail.openCheckout.borrowerPhone, outAt: detail.openCheckout.outAt.toISOString(), dueAt: iso(detail.openCheckout.dueAt), purpose: detail.openCheckout.purpose } : null}
      documents={a.documents.map((d) => ({ id: d.id, kind: d.kind, name: d.name, url: d.url, contentType: d.contentType, expiresAt: iso(d.expiresAt), createdAt: d.createdAt.toISOString() }))}
      schedules={detail.schedules.map((s) => ({ id: s.id, title: s.title, everyDays: s.everyDays, everyKm: s.everyKm, lastDoneAt: iso(s.lastDoneAt), state: s.due.state, reason: s.due.reason }))}
      records={a.maintenance.map((m) => ({ id: m.id, kind: m.kind, title: m.title, date: m.date.toISOString(), cost: m.cost, vendorName: m.vendorName, notes: m.notes, expenseId: m.expenseId }))}
      purchaseExpenseId={detail.purchaseExpense?.id ?? null}
      lists={{ facilities, departments, accounts }}
      canWrite={canWrite}
      canDelete={canWrite && session.canDelete}
      canPostExpenses={ctx.canPostExpenses}
    />
  );
}
