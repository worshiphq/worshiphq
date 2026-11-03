import "server-only";
import crypto from "node:crypto";
import { authSecret } from "@/lib/auth/tokens";

/**
 * Authenticated encryption (AES-256-GCM) for small secrets we must be able to read back, such as the
 * token that lets us charge a church's saved card without the church present.
 *
 * Hashing would be wrong here (we need the value back), and storing it plain would mean a database
 * leak is also a card-charging leak. The key is derived from the app secret under its own label, so it
 * is separate from the keys that sign sessions and tokens.
 *
 * If the app secret ever changes, anything sealed under the old one can no longer be opened: open()
 * returns null rather than throwing, and the caller treats that as "ask the church to save the card again".
 */
const key = () => crypto.createHash("sha256").update(`crypto-box|${authSecret()}`).digest();

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  // iv (12) | auth tag (16) | ciphertext
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function open(boxed: string): string | null {
  try {
    const raw = Buffer.from(boxed, "base64url");
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
