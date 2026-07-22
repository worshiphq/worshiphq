/**
 * Pledge SMS wording + small formatting helpers.
 *
 * These live outside the "use server" action file on purpose: a `"use server"`
 * module may only export async functions, so exporting constants from there
 * silently strips every export and breaks the build.
 */

export const DEFAULT_PLEDGE_TEMPLATE =
  "Dear {name}, your pledge of GHS {amount} to {church} has been recorded{due}. Thank you and God bless you!";
export const DEFAULT_PLEDGE_PAYMENT_TEMPLATE =
  "Dear {name}, we've received GHS {amount} toward your pledge at {church}. Paid so far: GHS {paid} of GHS {total}. God bless you!";
export const DEFAULT_PLEDGE_REMINDER_TEMPLATE =
  "Dear {name}, a friendly reminder: your pledge of GHS {total} to {church} is due in {days} day(s). Outstanding: GHS {balance}. God bless you!";

export const money = (n: number) =>
  n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fill(tpl: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "gi"), v),
    tpl,
  );
}
