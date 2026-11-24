"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { requireSuperAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import { normalisePhone } from "@/lib/phone";
import { naloConfigured } from "@/lib/sms/routing";
import { sendNaloOne } from "@/lib/integrations/nalo";
import { getAlertPhone } from "@/lib/outreach/owner-alert";
import { newNaloCallback, rememberNaloSends, saveNaloReportMode, type NaloReportMode } from "@/lib/sms/nalo-reports";

type Result = { ok: true } | { ok: false; error: string };

export async function setNaloReportMode(mode: NaloReportMode): Promise<Result> {
  await requireSuperAdmin();
  await logAdminAction("setNaloReportMode", { mode });
  if (mode !== "off" && mode !== "get" && mode !== "json") return { ok: false, error: "Choose off, method 1 or method 2." };
  await saveNaloReportMode(mode);
  revalidatePath("/admin/sms");
  return { ok: true };
}

/** One text to the owner's own alert number that asks Nalo for a delivery report. */
export async function sendNaloReportTest(method: "get" | "json"): Promise<Result> {
  await requireSuperAdmin();
  await logAdminAction("sendNaloReportTest", { method });
  if (!naloConfigured()) return { ok: false, error: "Nalo is not set up here." };
  const { phone } = await getAlertPhone();
  if (!phone) return { ok: false, error: "Save your alert number in Outreach first." };
  const to = normalisePhone(phone);
  const cb = newNaloCallback();
  const r = await sendNaloOne(
    { authKey: env.NALO_AUTH_KEY, username: env.NALO_USERNAME, password: env.NALO_PASSWORD, sender: env.NALO_SENDER_ID, report: { method: method === "json" ? "json" : "get", next: () => cb } },
    to, "WorshipHQ test: checking that Nalo reports delivery. No action needed.",
  );
  if (!r.ok) return { ok: false, error: r.error ?? "Nalo refused it." };
  await rememberNaloSends([{ ref: cb.ref, jobId: r.id, to }]);
  revalidatePath("/admin/sms");
  return { ok: true };
}
