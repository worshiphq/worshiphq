"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ticket, Wand2, Trash2, Copy, Check, Loader2 } from "lucide-react";
import { createCoupon, deleteCoupon } from "@/app/actions/coupons";
import { cn } from "@/lib/utils";

interface CouponRow {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  plan: string | null;
  interval: string | null;
  churchName: string | null;
  note: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

const input =
  "h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus-visible:border-teal-400/60 focus-visible:outline-none";
const label = "mb-1 block text-xs font-medium text-white/60";

export function CouponManager({
  coupons,
  churches,
  currencySymbol,
}: {
  coupons: CouponRow[];
  churches: { id: string; name: string }[];
  currencySymbol: string;
}) {
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("50");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  /** Build a readable code like WOR50OFF-K3QP from the current discount. */
  function generate() {
    const val = parseFloat(discountValue) || 0;
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    setCode(`WOR${val}${discountType === "percent" ? "PCT" : "OFF"}${rand}`);
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1500);
  }

  const describe = (c: CouponRow) =>
    c.discountType === "percent" ? `${c.discountValue}% off` : `${currencySymbol}${c.discountValue} off`;

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="flex items-center gap-2 font-semibold text-white">
        <Ticket className="size-4" /> Discount codes
      </h2>
      <p className="mt-1 text-sm text-white/50">
        Agreed a price with a pastor in person? Issue a single-use code they enter at checkout.
        Each code works <b>once</b> and can be locked to one church, plan or billing cycle.
      </p>

      <form
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        action={(fd) =>
          start(async () => {
            setError("");
            const res = await createCoupon(fd);
            if (!res?.ok) { setError(res?.error ?? "Couldn't create the code."); return; }
            setCode("");
            router.refresh();
          })
        }
      >
        <div>
          <span className={label}>Discount type</span>
          <select
            name="discountType"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
            className={input}
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </div>

        <div>
          <span className={label}>{discountType === "percent" ? "Percent (%)" : `Amount (${currencySymbol})`}</span>
          <input
            name="discountValue"
            type="number"
            step="0.01"
            min="0"
            required
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            className={input}
          />
        </div>

        <div>
          <span className={label}>Code (blank = auto)</span>
          <div className="flex gap-2">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WOR2650OFF"
              className={cn(input, "font-mono uppercase")}
            />
            <button
              type="button"
              onClick={generate}
              title="Generate a code"
              className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:text-white"
            >
              <Wand2 className="size-4" />
            </button>
          </div>
        </div>

        <div>
          <span className={label}>Lock to church (optional)</span>
          <select name="churchId" defaultValue="" className={input}>
            <option value="">Any church</option>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <span className={label}>Plan (optional)</span>
          <select name="plan" defaultValue="" className={input}>
            <option value="">Any plan</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
        </div>

        <div>
          <span className={label}>Billing (optional)</span>
          <select name="interval" defaultValue="" className={input}>
            <option value="">Any</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div>
          <span className={label}>Expires (optional)</span>
          <input name="expiresAt" type="date" className={input} />
        </div>

        <div className="lg:col-span-2">
          <span className={label}>Note (why you granted it)</span>
          <input name="note" placeholder="Agreed with Pastor Mensah at the Accra meeting" className={input} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-400 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Ticket className="size-4" />}
            Create code
          </button>
        </div>
      </form>

      {/* ── Issued codes ── */}
      <div className="mt-6 overflow-x-auto">
        {coupons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">
            No discount codes yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                <th className="pb-2 pr-3">Code</th>
                <th className="pb-2 pr-3">Discount</th>
                <th className="pb-2 pr-3">Restricted to</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Note</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const restrictions = [c.churchName, c.plan, c.interval].filter(Boolean).join(" · ") || "Anyone";
                return (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => copy(c.code)}
                        className="inline-flex items-center gap-1.5 font-mono font-semibold text-white hover:text-teal-300"
                        title="Copy code"
                      >
                        {c.code}
                        {copied === c.code ? <Check className="size-3 text-teal-400" /> : <Copy className="size-3 opacity-50" />}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-white/80">{describe(c)}</td>
                    <td className="py-2 pr-3 text-white/50">{restrictions}</td>
                    <td className="py-2 pr-3">
                      {c.usedAt ? (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                          Used {new Date(c.usedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      ) : expired ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Expired</span>
                      ) : (
                        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-300">Available</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-white/40">{c.note ?? ""}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => start(async () => { await deleteCoupon(c.id); router.refresh(); })}
                        className="rounded p-1 text-white/30 hover:text-red-400"
                        title="Delete code"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
