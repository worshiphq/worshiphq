// Which service a piece of giving belongs to. Pure (no database, no React), so it can be tested directly and used in
// client components. The Giving forms offer these choices; the server turns the chosen one into a service record.

/** One service a gift can be linked to on a given day. `key` is the service name in lower case, so the same
 *  service offered by a service time, an existing record and an attendance session appears once. */
export interface ServiceChoice {
  key: string;
  name: string;
  serviceIncomeId: string | null;
  slotId: string | null;
  sessionId: string | null;
  startMinute: number | null;
}

/** What the browser sends: the chosen service by name, with the ids it came from (checked again on the server). */
export interface ServicePick { name: string; slotId?: string | null; sessionId?: string | null }

/** Choice key for "another service" typed by hand. */
export const OTHER_SERVICE = "__other";
/** Choice key for "Not linked to a service". */
export const NO_SERVICE = "";

export const serviceKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Tidy a service name typed or sent by the browser: trimmed, single spaces, at most 80 characters. */
export const cleanServiceName = (name: unknown) => String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);

/**
 * The services on one day, in a sensible order: the church's service times for that weekday (by start time), then
 * service records already made that day, then attendance taken that day. Same name = same service.
 */
export function mergeServiceChoices(input: {
  slots: { id: string; name: string; startMinute: number }[];
  records: { id: string; serviceName: string; slotId?: string | null; sessionId?: string | null }[];
  sessions: { id: string; serviceName: string }[];
}): ServiceChoice[] {
  const out = new Map<string, ServiceChoice>();
  const add = (name: string, patch: Partial<ServiceChoice>) => {
    const clean = cleanServiceName(name);
    const key = serviceKey(clean);
    if (!key) return;
    const cur = out.get(key) ?? { key, name: clean, serviceIncomeId: null, slotId: null, sessionId: null, startMinute: null };
    out.set(key, {
      ...cur,
      serviceIncomeId: cur.serviceIncomeId ?? patch.serviceIncomeId ?? null,
      slotId: cur.slotId ?? patch.slotId ?? null,
      sessionId: cur.sessionId ?? patch.sessionId ?? null,
      startMinute: cur.startMinute ?? patch.startMinute ?? null,
    });
  };
  for (const s of [...input.slots].sort((a, b) => a.startMinute - b.startMinute)) add(s.name, { slotId: s.id, startMinute: s.startMinute });
  for (const r of input.records) add(r.serviceName, { serviceIncomeId: r.id, slotId: r.slotId ?? null, sessionId: r.sessionId ?? null });
  for (const s of input.sessions) add(s.serviceName, { sessionId: s.id });
  return [...out.values()];
}

/**
 * The service to preselect. In order:
 *  1. `prefer` (the form was opened for a particular service), when it is one of the choices;
 *  2. the only service, when exactly one fits that day;
 *  3. the last choice used on that day on this device (which may be "not linked");
 *  4. otherwise not linked.
 * Returns a choice key, or NO_SERVICE.
 */
export function defaultServiceChoice(choices: ServiceChoice[], opts: { prefer?: string | null; last?: string | null } = {}): string {
  const has = (name: string | null | undefined) => (name ? choices.find((c) => c.key === serviceKey(name))?.key ?? null : null);
  const preferred = has(opts.prefer);
  if (preferred) return preferred;
  if (choices.length === 1) return choices[0].key;
  if (opts.last === NO_SERVICE) return NO_SERVICE;
  return has(opts.last) ?? NO_SERVICE;
}

/** The pick to send for a choice key (null = not linked). */
export function pickFor(choices: ServiceChoice[], key: string, otherName = ""): ServicePick | null {
  if (key === OTHER_SERVICE) {
    const name = cleanServiceName(otherName);
    return name ? { name, slotId: null, sessionId: null } : null;
  }
  const c = choices.find((x) => x.key === key);
  return c ? { name: c.name, slotId: c.slotId, sessionId: c.sessionId } : null;
}
