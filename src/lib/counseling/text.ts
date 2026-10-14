import "server-only";
import { db } from "@/lib/db";
import { sendChurchSms } from "@/lib/sms/credits";
import { renderTemplate, templateFor } from "@/lib/messages/registry";
import { whenInTz } from "@/lib/time/tz";

export type CounselingTextKind = "scheduled" | "reminder" | "update" | "custom";

const TEMPLATE_KEY: Record<Exclude<CounselingTextKind, "custom">, string> = {
  scheduled: "counseling_scheduled",
  reminder: "counseling_reminder",
  update: "counseling_update",
};

/** Everything needed to word and address a text about one session. */
async function load(churchId: string, sessionId: string) {
  const [session, church] = await Promise.all([
    db.counselingSession.findFirst({
      where: { id: sessionId, churchId },
      select: {
        id: true, scheduledAt: true, counseleeName: true, counseleePhone: true,
        person: { select: { firstName: true, phone: true } },
        counselor: { select: { name: true } },
      },
    }),
    db.church.findUnique({ where: { id: churchId }, select: { name: true, timezone: true, messageTemplates: true } }),
  ]);
  return { session, church };
}

/**
 * Word a text for a session. The topic of the session is never included, only
 * who, when and with whom, because an SMS is not private.
 */
export async function counselingDraft(churchId: string, sessionId: string, kind: CounselingTextKind) {
  const { session, church } = await load(churchId, sessionId);
  if (!session || !church) return null;

  const to = session.person?.phone ?? session.counseleePhone ?? null;
  const first = session.person?.firstName ?? (session.counseleeName ?? "").trim().split(/\s+/)[0] ?? "";
  if (kind === "custom") return { to, message: "", name: first || "there" };

  const message = renderTemplate(templateFor(church.messageTemplates, TEMPLATE_KEY[kind]), {
    name: first || "there",
    church: church.name,
    counselor: session.counselor?.name ?? "our pastoral team",
    when: session.scheduledAt ? whenInTz(session.scheduledAt, church.timezone) : "a time we will confirm",
  });
  return { to, message, name: first || "there" };
}

/** Send (and log) one text about a counselling session. */
export async function sendCounselingText(opts: {
  churchId: string;
  sessionId: string;
  kind: CounselingTextKind;
  sentBy: string;
  message?: string;
}): Promise<{ ok: true; to: string; message: string } | { ok: false; error: string }> {
  const draft = await counselingDraft(opts.churchId, opts.sessionId, opts.kind);
  if (!draft) return { ok: false, error: "Session not found." };
  if (!draft.to) return { ok: false, error: "There is no phone number for this person. Add one by editing the session." };

  const message = (opts.message ?? "").trim() || draft.message;
  if (!message) return { ok: false, error: "Write the message first." };

  const res = await sendChurchSms(opts.churchId, draft.to, message.slice(0, 1000), { note: "Counselling" });
  if (!res.ok) {
    return { ok: false, error: res.insufficient ? "Not enough SMS credits. Top up and try again." : "The text could not be sent." };
  }
  await db.counselingMessage.create({
    data: { churchId: opts.churchId, sessionId: opts.sessionId, kind: opts.kind, body: message, sentTo: draft.to, sentBy: opts.sentBy },
  });
  return { ok: true, to: draft.to, message };
}
