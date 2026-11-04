import { env } from "@/lib/env";

export type SmsProvider = "arkesel" | "hubtel" | "nalo" | "mnotify" | "twilio";

/** A normalised number (digits with country code, no "+") belongs to Ghana when it starts with 233. */
export function isGhanaNumber(normalised: string): boolean {
  return normalised.startsWith("233");
}

/** Nalo can send once we have either an API key or a username and password. */
export function naloConfigured(): boolean {
  return !!(env.NALO_AUTH_KEY || (env.NALO_USERNAME && env.NALO_PASSWORD));
}

export type Routing = {
  /** The Ghana / default carrier (what SMS_PROVIDER selects, normally Hubtel). */
  primary: SmsProvider;
  /** The carrier for numbers outside Ghana. Null means "no separate international carrier", so everything
   *  goes to the primary (today's behaviour). Nalo takes this role once it is configured. */
  international: SmsProvider | null;
};

/**
 * Decide which carriers are in play. Phase 1: Hubtel (or whatever SMS_PROVIDER is) keeps Ghana, and Nalo
 * takes everything outside Ghana as soon as it is configured. If the primary already is Nalo, or Nalo is not
 * set up, there is no split and every number uses the primary, exactly as before.
 */
export function resolveRouting(): Routing {
  const primary = env.SMS_PROVIDER as SmsProvider;
  const international = primary !== "nalo" && naloConfigured() ? "nalo" : null;
  return { primary, international };
}

/**
 * The routing for one church. SuperAdmin can put a church on Hubtel or Nalo while the move between them is under
 * way. A church set to Nalo uses Nalo for every number. A Hubtel church keeps Nalo for numbers outside Ghana. If Nalo
 * is not set up on this server, a church set to it falls back to the default rather than failing to send.
 */
export function routingForChurch(carrier: string | null | undefined): Routing {
  const base = resolveRouting();
  if (carrier !== "hubtel" && carrier !== "nalo") return base;
  if (carrier === "nalo" && !naloConfigured()) return base;
  return { primary: carrier, international: carrier !== "nalo" && naloConfigured() ? "nalo" : null };
}

/** Which carrier handles one number, given the routing. */
export function providerForNumber(normalised: string, routing: Routing): SmsProvider {
  if (routing.international && !isGhanaNumber(normalised)) return routing.international;
  return routing.primary;
}
