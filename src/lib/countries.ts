import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { COUNTRY_NAMES } from "@/lib/country-names";

export type Country = { iso: CountryCode; name: string; dial: string; africa: boolean };

const AFRICA = new Set<string>([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET",
  "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW",
  "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW",
]);

/** Guernsey, Jersey and the Isle of Man share +44 with the UK; people expect to see the UK. */
const SHARES_UK_CODE = new Set<string>(["GG", "JE", "IM"]);

let cache: Country[] | null = null;

/** Every country the phone library knows, with its dial code and English name, sorted by name. */
export function allCountries(): Country[] {
  if (cache) return cache;
  cache = getCountries()
    .map((iso) => ({ iso, name: COUNTRY_NAMES[iso] ?? iso, dial: getCountryCallingCode(iso), africa: AFRICA.has(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export function countryByIso(iso: string | null | undefined): Country | undefined {
  if (!iso) return undefined;
  const up = iso.toUpperCase();
  return allCountries().find((c) => c.iso === up);
}

const ALIASES: Record<string, CountryCode> = {
  usa: "US", "united states of america": "US", america: "US", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  "ivory coast": "CI", "cote d'ivoire": "CI", "côte d'ivoire": "CI", "côte d’ivoire": "CI", drc: "CD", "dr congo": "CD",
  "democratic republic of the congo": "CD", "congo-kinshasa": "CD", "republic of the congo": "CG", "the gambia": "GM", gambia: "GM",
  swaziland: "SZ", eswatini: "SZ", "cape verde": "CV", uae: "AE", "south korea": "KR", russia: "RU", "czech republic": "CZ",
};

const TIME_ZONES: Record<string, CountryCode> = {
  "Africa/Accra": "GH", "Africa/Lagos": "NG", "Africa/Freetown": "SL", "Africa/Monrovia": "LR", "Africa/Abidjan": "CI",
  "Africa/Dakar": "SN", "Africa/Banjul": "GM", "Africa/Conakry": "GN", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF",
  "Africa/Lome": "TG", "Africa/Porto-Novo": "BJ", "Africa/Douala": "CM", "Africa/Libreville": "GA", "Africa/Kinshasa": "CD",
  "Africa/Lubumbashi": "CD", "Africa/Brazzaville": "CG", "Africa/Luanda": "AO", "Africa/Nairobi": "KE", "Africa/Kampala": "UG",
  "Africa/Dar_es_Salaam": "TZ", "Africa/Kigali": "RW", "Africa/Bujumbura": "BI", "Africa/Addis_Ababa": "ET", "Africa/Lusaka": "ZM",
  "Africa/Harare": "ZW", "Africa/Blantyre": "MW", "Africa/Maputo": "MZ", "Africa/Gaborone": "BW", "Africa/Windhoek": "NA",
  "Africa/Johannesburg": "ZA", "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Africa/Tunis": "TN", "Africa/Algiers": "DZ",
  "Europe/London": "GB", "Europe/Dublin": "IE", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Toronto": "CA", "America/Vancouver": "CA", "Australia/Sydney": "AU", "Europe/Berlin": "DE",
  "Europe/Paris": "FR", "Europe/Amsterdam": "NL",
};

/** A best guess from the browser's time zone, e.g. "Africa/Freetown" -> SL. */
export function countryFromTimeZone(zone: string | null | undefined): CountryCode | null {
  return (zone && TIME_ZONES[zone]) || null;
}

/** Church.country is stored as a name ("Sierra Leone"); turn it into an ISO code, or null when it isn't recognised. */
export function countryFromName(name: string | null | undefined): CountryCode | null {
  const s = (name ?? "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s) && countryByIso(s)) return s.toUpperCase() as CountryCode;
  const key = s.toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  return allCountries().find((c) => c.name.toLowerCase() === key)?.iso ?? null;
}

/**
 * Split a stored number into its country and the national part, for editing.
 * Understands "+23276123456", old digits-only "23276123456", and local "0244123456" (which uses `fallback`).
 */
export function splitPhone(value: string | null | undefined, fallback: CountryCode): { iso: CountryCode; national: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { iso: fallback, national: "" };
  const digits = raw.replace(/[^\d+]/g, "");
  const intlForm = digits.startsWith("+") ? digits : digits.startsWith("00") ? "+" + digits.slice(2) : digits.startsWith("0") ? null : "+" + digits;
  if (intlForm) {
    const p = parsePhoneNumberFromString(intlForm);
    if (p?.country) return { iso: SHARES_UK_CODE.has(p.country) ? "GB" : p.country, national: p.nationalNumber };
    const byCode = allCountries().find((c) => intlForm.slice(1).startsWith(c.dial));
    if (digits.startsWith("+") && byCode) return { iso: byCode.iso, national: intlForm.slice(1 + byCode.dial.length) };
  }
  return { iso: fallback, national: digits.replace(/^\+/, "") };
}

/** The full international number for what the user has typed ("" while the box is empty). */
export function composePhone(iso: CountryCode, national: string): string {
  const typed = (national ?? "").trim();
  if (!typed.replace(/\D/g, "")) return "";
  const parsed = parsePhoneNumberFromString(typed, iso);
  if (parsed?.isPossible()) return parsed.number;
  // Still being typed (or not a real number): keep what was typed, without the local leading 0.
  const digits = typed.replace(/\D/g, "");
  const dial = getCountryCallingCode(iso);
  return `+${dial}${digits.replace(/^0+/, "")}`;
}
