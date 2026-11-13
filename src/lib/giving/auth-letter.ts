import "server-only";
import { db } from "@/lib/db";

/**
 * The church's letter authorising WODONA to collect gifts for it through Paystack. Paystack may ask for one per church
 * before a platform collects on a church's behalf. The church prints it from Settings, Online Payments, stamps and
 * signs it, and uploads a photo or scan. The file is private: it lives in R2 under a key, never at a public URL.
 */

export const LETTER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
/** Vercel caps a request at about 4.5 MB; images are shrunk in the browser first, so this is mostly for PDFs. */
export const LETTER_MAX_BYTES = 4 * 1024 * 1024;

/** The request a letter belongs to: the church's current (not removed or cancelled) online giving request. */
export async function currentGivingRequest(churchId: string) {
  return db.paymentRequest.findFirst({
    where: { churchId, status: { notIn: ["removed", "cancelled", "trashed", "declined"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, authLetterKey: true, authLetterType: true, authLetterAt: true, settlementType: true, bankName: true, accountNumber: true, accountName: true },
  });
}

/** WODONA's business details for the letter, from the company details SuperAdmin keeps for receipts. */
export async function wodonaDetails() {
  const { getReceiptSettings } = await import("@/lib/receipts/service");
  const st = await getReceiptSettings();
  return {
    name: st.companyName || "WODONA",
    // The business-name registration number (BN...), public record. Never the TIN.
    registration: st.registration || "BN576961126",
    address: st.address || "Plot 11, Appiadu Kokoben, Kumasi, Ashanti (AK-900-2594)",
    email: st.email,
    website: st.whqWebsite || "worshiphq.app",
  };
}
