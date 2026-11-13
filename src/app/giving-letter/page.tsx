import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentGivingRequest, wodonaDetails } from "@/lib/giving/auth-letter";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Online giving authorisation letter", robots: { index: false } };

/**
 * A printable letter, already filled in, that the church stamps and signs: it authorises WODONA to collect gifts
 * for the church through Paystack, paid straight into the church's own account. Outside the app layout so it
 * prints as a clean A4 page.
 */
export default async function GivingLetterPage() {
  const session = await requireSession();
  if (session.role !== "Owner" && session.role !== "Admin") redirect("/app/settings?tab=online-payments");

  const [church, req, w] = await Promise.all([
    db.church.findUnique({ where: { id: session.churchId }, select: { name: true, address: true, city: true, country: true } }),
    currentGivingRequest(session.churchId),
    wodonaDetails(),
  ]);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const churchName = church?.name ?? "";
  const place = [church?.address, church?.city, church?.country].filter(Boolean).join(", ");
  const blank = <span className="inline-block min-w-[14rem] border-b border-black/50">&nbsp;</span>;

  return (
    <div className="min-h-dvh bg-neutral-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <a href="/app/settings?tab=online-payments" className="text-sm text-neutral-700 underline">Back to Online Payments</a>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-[18mm] py-[16mm] text-[11.5pt] leading-[1.6] text-black shadow-lg print:max-w-none print:shadow-none">
        {/* The church's letterhead */}
        <header className="border-b-2 border-black pb-3 text-center">
          <div className="text-[17pt] font-bold uppercase tracking-wide">{churchName}</div>
          {place && <div className="text-[10pt]">{place}</div>}
        </header>

        <p className="mt-6">{today}</p>

        <div className="mt-5">
          <p>The Compliance Team</p>
          <p>Paystack Payments Limited</p>
          <p>Accra, Ghana</p>
        </div>

        <p className="mt-6">Dear Sir or Madam,</p>
        <p className="mt-3 font-bold underline">AUTHORISATION TO COLLECT ONLINE GIVING ON BEHALF OF {churchName.toUpperCase()}</p>

        <p className="mt-4">
          We, the undersigned leaders of <b>{churchName}</b>, authorise <b>{w.name}</b> (Business Registration No. {w.registration}),
          the operator of the WorshipHQ church management platform ({w.website}), to collect tithes, offerings and other gifts
          from our members and supporters through Paystack on our behalf.
        </p>

        <p className="mt-3">All gifts collected for the church are to be paid directly into the church&rsquo;s own account below:</p>
        <table className="mt-3 w-full border-collapse text-[11pt]">
          <tbody>
            {[
              ["Account name", req?.accountName],
              [req?.settlementType === "momo" ? "Mobile Money network" : "Bank", req?.bankName],
              [req?.settlementType === "momo" ? "Mobile Money number" : "Account number", req?.accountNumber],
            ].map(([k, v]) => (
              <tr key={k as string}>
                <td className="w-[40%] border border-black/60 px-3 py-1.5 font-semibold">{k}</td>
                <td className="border border-black/60 px-3 py-1.5">{v || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4">
          We understand that Paystack&rsquo;s processing fee and the WorshipHQ platform fee, as set out in our WorshipHQ account,
          may be deducted from each gift before it is paid to us. This authorisation stays in force until we withdraw it in writing.
        </p>

        <p className="mt-4">Yours faithfully,</p>

        {/* Two leaders sign, and the church stamps */}
        <div className="mt-8 grid grid-cols-2 gap-10">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-3 text-[10.5pt]">
              <div className="h-12 border-b border-black/70" />
              <p>Signature</p>
              <p>Name: {blank}</p>
              <p>Position: {blank}</p>
              <p>Phone: {blank}</p>
              <p>Date: {blank}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-end">
          <div className="grid h-36 w-56 place-items-center border-2 border-dashed border-black/50 text-[10pt] text-black/60">Church stamp</div>
        </div>

        <footer className="mt-10 border-t border-black/30 pt-2 text-center text-[8.5pt] text-black/60">
          Prepared through WorshipHQ for {churchName}. {w.name}, {w.address}.
        </footer>
      </article>
    </div>
  );
}
