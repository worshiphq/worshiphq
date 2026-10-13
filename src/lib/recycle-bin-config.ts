/** Shared by server and client: how long deleted things wait in the recycle
 *  bin before they're permanently removed. */
export const RECYCLE_BIN_DAYS = 7;

/** One-line reminder used in delete confirmations and toasts. */
export const BIN_NOTE = `It goes to the recycle bin, where you can restore it for ${RECYCLE_BIN_DAYS} days.`;

/** Short toast after a successful delete. */
export const BIN_TOAST = `Moved to the recycle bin. You can restore it for ${RECYCLE_BIN_DAYS} days.`;

/** "Delete X?" plus the recycle-bin reminder, for window.confirm(). */
export function binConfirm(question: string): string {
  return `${question}\n\n${BIN_NOTE}`;
}
