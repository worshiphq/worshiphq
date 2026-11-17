"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { saveAsset } from "@/app/actions/assets";
import { searchPickerPeople } from "@/app/actions/lists";
import { SearchSelect } from "@/components/app/search-select";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/components/ui/feedback";
import { PhotoInput } from "@/components/app/shared/photo-input";
import { Sheet, BusyButton, FormError, FormSection, F, Select, ChipChoice, money, ymdOf } from "@/components/app/shared/kit";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, PAYMENT_METHODS } from "@/lib/assets/categories";
import { DEFAULT_LIFE, straightLine } from "@/lib/assets/depreciation";

export type AssetFormValue = {
  id: string;
  name: string;
  category: string;
  condition: string;
  status: string;
  quantity: number;
  serialNo: string | null;
  location: string | null;
  facilityId: string | null;
  departmentId: string | null;
  custodian: { id: string; name: string } | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  supplier: string | null;
  warrantyExpires: string | null;
  depreciation: string;
  usefulLifeYears: number | null;
  salvageValue: number | null;
  inServiceDate: string | null;
  notes: string | null;
  photoUrl: string | null;
  hasPurchaseExpense?: boolean;
};

export type AssetFormLists = {
  facilities: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  accounts: { id: string; name: string; isDefault: boolean }[];
};

export function AssetForm({ asset, lists, canPostExpenses, onClose, onSaved }: {
  asset?: AssetFormValue | null;
  lists: AssetFormLists;
  canPostExpenses: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [category, setCategory] = useState(asset?.category ?? "general");
  const [condition, setCondition] = useState(asset?.condition ?? "good");
  const [price, setPrice] = useState(asset?.purchasePrice ? String(asset.purchasePrice) : "");
  const [bought, setBought] = useState(asset?.purchaseDate ? ymdOf(asset.purchaseDate) : "");
  const [depreciate, setDepreciate] = useState(asset?.depreciation === "straight-line");
  const [life, setLife] = useState(asset?.usefulLifeYears ? String(asset.usefulLifeYears) : String(DEFAULT_LIFE[asset?.category ?? "general"] ?? 5));
  const [salvage, setSalvage] = useState(asset?.salvageValue != null ? String(asset.salvageValue) : "");
  const [recordExpense, setRecordExpense] = useState(false);
  const [place, setPlace] = useState(asset?.facilityId ? `f:${asset.facilityId}` : asset?.location ? "text" : lists.facilities.length ? "" : "text");

  const preview = useMemo(() => {
    const cost = Number(price) || 0;
    if (!depreciate || !cost || !(Number(life) > 0)) return null;
    const r = straightLine({ cost, salvage: Number(salvage) || 0, lifeYears: Number(life), inService: bought || new Date().toISOString().slice(0, 10) });
    return `About ${money(r.annual)} a year, worth ${money(r.bookValue)} today`;
  }, [price, depreciate, life, salvage, bought]);

  const submit = (fd: FormData) => {
    setError("");
    if (asset) fd.set("id", asset.id);
    fd.set("category", category);
    fd.set("condition", condition);
    if (place.startsWith("f:")) { fd.set("facilityId", place.slice(2)); fd.set("location", ""); } else fd.set("facilityId", "");
    if (depreciate) fd.set("depreciate", "1");
    if (recordExpense) fd.set("recordExpense", "1");
    start(async () => {
      const r = await saveAsset(fd);
      if (r.ok) {
        toast(asset ? "Changes saved" : "Asset added", "success");
        router.refresh();
        onSaved?.(r.id!);
        onClose();
      } else setError(r.error ?? "That did not save. Try again.");
    });
  };

  return (
    <Sheet open onClose={onClose} busy={pending} wide title={asset ? `Edit ${asset.name}` : "Add asset"} description={asset ? undefined : "One item, or a set of the same thing (for example 40 chairs)."}>
      <form action={submit} className="space-y-5">
        <FormSection title="Photo">
          <PhotoInput name="photo" initial={asset?.photoUrl} label="A photo helps people recognise it" icon={Package} />
        </FormSection>

        <FormSection title="Basics">
          <F label="Name" htmlFor="a-name"><Input id="a-name" name="name" defaultValue={asset?.name} placeholder="e.g. Yamaha PSR keyboard" required autoFocus={!asset} /></F>
          <F label="Category">
            <ChipChoice value={category} onChange={(c) => { setCategory(c); if (!asset?.usefulLifeYears) setLife(String(DEFAULT_LIFE[c] ?? 5)); }} options={ASSET_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
          </F>
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="How many" htmlFor="a-qty"><Input id="a-qty" name="quantity" type="number" min="1" inputMode="numeric" defaultValue={asset?.quantity ?? 1} /></F>
            <F label="Serial number" htmlFor="a-sn" className="sm:col-span-2"><Input id="a-sn" name="serialNo" defaultValue={asset?.serialNo ?? ""} placeholder="Optional" /></F>
          </div>
          <F label="Condition">
            <ChipChoice value={condition} onChange={setCondition} options={ASSET_CONDITIONS.map((c) => ({ value: c.key, label: c.label }))} />
          </F>
          {asset && !["checked-out", "disposed"].includes(asset.status) && (
            <F label="Status" htmlFor="a-status">
              <Select id="a-status" name="status" defaultValue={asset.status} options={[{ value: "in-service", label: "In service" }, { value: "in-repair", label: "In repair" }, { value: "in-storage", label: "In storage" }, { value: "lost", label: "Lost" }]} />
            </F>
          )}
        </FormSection>

        <FormSection title="Where and who">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Room" htmlFor="a-room">
              <Select id="a-room" value={place} onChange={setPlace} options={[{ value: "", label: "Not set" }, ...lists.facilities.map((f) => ({ value: `f:${f.id}`, label: f.name })), { value: "text", label: "Somewhere else (type it)" }]} />
            </F>
            {place === "text" && <F label="Where it is kept" htmlFor="a-loc"><Input id="a-loc" name="location" defaultValue={asset?.location ?? ""} placeholder="e.g. Pastor's office" /></F>}
            {lists.departments.length > 0 && (
              <F label="Department" htmlFor="a-dept"><Select id="a-dept" name="departmentId" defaultValue={asset?.departmentId ?? ""} options={[{ value: "", label: "Whole church" }, ...lists.departments.map((d) => ({ value: d.id, label: d.name }))]} /></F>
            )}
            <F label="Looked after by" hint="The person responsible for it">
              <SearchSelect
                name="custodianId"
                defaultValue={asset?.custodian?.id ?? ""}
                options={[{ value: "", label: "Nobody in particular" }, ...(asset?.custodian ? [{ value: asset.custodian.id, label: asset.custodian.name }] : [])]}
                placeholder="Search for a person…"
                search={(q) => searchPickerPeople("assets", q, { who: "notVisitor" })}
              />
            </F>
          </div>
        </FormSection>

        <FormSection title="Purchase">
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Bought on" htmlFor="a-pd"><Input id="a-pd" name="purchaseDate" type="date" value={bought} onChange={(e) => setBought(e.target.value)} /></F>
            <F label="Cost each (₵)" htmlFor="a-pp"><Input id="a-pp" name="purchasePrice" type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="tabular-nums" /></F>
            <F label="Supplier" htmlFor="a-sup"><Input id="a-sup" name="supplier" defaultValue={asset?.supplier ?? ""} placeholder="Shop or person" /></F>
          </div>
          {canPostExpenses && !asset?.hasPurchaseExpense && Number(price) > 0 && (
            <div className="rounded-xl border border-line bg-surface-2/50 p-3">
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={recordExpense} onChange={(e) => setRecordExpense(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
                <span><span className="font-medium text-ink">Also record this as an expense</span><span className="block text-xs text-ink-muted">Only once. Editing the item later never records it again.</span></span>
              </label>
              {recordExpense && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <F label="Paid from" htmlFor="a-acc"><Select id="a-acc" name="accountId" defaultValue={lists.accounts.find((a) => a.isDefault)?.id ?? ""} options={[{ value: "", label: "Default account" }, ...lists.accounts.map((a) => ({ value: a.id, label: a.name }))]} /></F>
                  <F label="Paid how" htmlFor="a-pm"><Select id="a-pm" name="paymentMethod" defaultValue="" options={[{ value: "", label: "Not recorded" }, ...PAYMENT_METHODS.map((m) => ({ value: m.key, label: m.label }))]} /></F>
                </div>
              )}
            </div>
          )}
        </FormSection>

        <FormSection title="Value over time">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span><span className="font-medium text-ink">Lose value each year</span><span className="block text-xs text-ink-muted">Shows what it is worth today, not just what it cost.</span></span>
            <input type="checkbox" checked={depreciate} onChange={(e) => setDepreciate(e.target.checked)} className="size-5 accent-[var(--color-primary)]" />
          </label>
          {depreciate && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <F label="Useful for (years)" htmlFor="a-life"><Input id="a-life" name="usefulLifeYears" type="number" min="1" max="100" inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} /></F>
                <F label="Worth at the end (₵)" htmlFor="a-salv"><Input id="a-salv" name="salvageValue" type="number" min="0" step="0.01" inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} placeholder="0" /></F>
                <F label="In use since" htmlFor="a-isd"><Input id="a-isd" name="inServiceDate" type="date" defaultValue={ymdOf(asset?.inServiceDate)} /></F>
              </div>
              {preview && <p className="rounded-lg bg-primary-soft/40 px-3 py-2 text-sm font-medium text-primary tabular-nums">{preview}</p>}
            </>
          )}
        </FormSection>

        <FormSection title="Warranty and notes">
          <F label="Warranty ends on" htmlFor="a-war" className="sm:max-w-xs"><Input id="a-war" name="warrantyExpires" type="date" defaultValue={ymdOf(asset?.warrantyExpires)} /></F>
          <F label="Notes" htmlFor="a-notes"><Textarea id="a-notes" name="notes" defaultValue={asset?.notes ?? ""} rows={2} placeholder="Anything worth knowing" className="min-h-16" /></F>
        </FormSection>

        <FormError error={error} />
        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-surface px-4 pt-3 sm:static sm:mx-0 sm:border-0 sm:px-0">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <BusyButton busy={pending} busyLabel="Saving…" className="flex-1">Save asset</BusyButton>
        </div>
      </form>
    </Sheet>
  );
}
