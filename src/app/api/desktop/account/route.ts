import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/auth/otp";
import { phoneVariants } from "@/lib/phone";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { verifyDesktopToken } from "@/lib/desktop-auth";

/**
 * Account security bridge for the desktop app - mirrors the web account
 * actions (change password / phone / email with password + OTP checks).
 * Body: { action, ...fields }.
 */
export async function POST(req: Request) {
  const auth = await verifyDesktopToken(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findFirst({
    where: { id: auth.uid, churchId: auth.cid },
    select: { id: true, passwordHash: true, phone: true, phoneVerified: true },
  });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  try {
    const body = await req.json();
    const action = String(body.action ?? "");

    switch (action) {
      case "change-password": {
        const current = String(body.current ?? "");
        const next = String(body.next ?? "");
        if (!passwordMeetsPolicy(next)) {
          return NextResponse.json({ ok: false, error: "New password needs 8+ characters with a capital letter, a number and a symbol." });
        }
        if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
          return NextResponse.json({ ok: false, error: "Your current password is incorrect." });
        }
        // Signs out every other session and device, including this desktop token; the app signs in again.
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
        });
        return NextResponse.json({ ok: true, reauth: true });
      }

      case "start-phone-change": {
        const password = String(body.password ?? "");
        const newPhone = String(body.newPhone ?? "").trim();
        if (!newPhone) return NextResponse.json({ ok: false, error: "Phone number required." });
        if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
          return NextResponse.json({ ok: false, error: "Incorrect password." });
        }
        const taken = await db.user.findFirst({ where: { phone: { in: phoneVariants(newPhone) }, id: { not: user.id } } });
        if (taken) return NextResponse.json({ ok: false, error: "This phone number is already in use." });
        const result = await sendOtp({ phone: newPhone, purpose: "verify-phone", userId: user.id });
        if (!result.ok) return NextResponse.json({ ok: false, error: result.limited ? result.error : "Couldn't send verification SMS." });
        return NextResponse.json({ ok: true, verificationId: result.verificationId });
      }

      case "confirm-phone-change": {
        // Save the number the code went to, never one sent with the request.
        const result = await verifyOtp(String(body.verificationId ?? ""), String(body.code ?? "").trim(), { purpose: "verify-phone", userId: user.id });
        if (!result.ok || !result.phone) return NextResponse.json({ ok: false, error: result.error ?? "Invalid code." });
        const taken = await db.user.findFirst({ where: { phone: { in: phoneVariants(result.phone) }, id: { not: user.id } } });
        if (taken) return NextResponse.json({ ok: false, error: "This phone number is already in use." });
        await db.user.update({ where: { id: user.id }, data: { phone: result.phone, phoneVerified: true } });
        return NextResponse.json({ ok: true });
      }

      case "start-email-change": {
        const password = String(body.password ?? "");
        const newEmail = String(body.newEmail ?? "").toLowerCase().trim();
        if (!newEmail || !newEmail.includes("@")) return NextResponse.json({ ok: false, error: "Valid email required." });
        if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
          return NextResponse.json({ ok: false, error: "Incorrect password." });
        }
        const taken = await db.user.findUnique({ where: { email: newEmail } });
        if (taken) return NextResponse.json({ ok: false, error: "This email is already in use." });
        const result = await sendOtp({ channel: "email", email: newEmail, purpose: "verify-email", userId: user.id });
        if (!result.ok) return NextResponse.json({ ok: false, error: result.limited ? result.error : "Couldn't send verification email." });
        return NextResponse.json({ ok: true, verificationId: result.verificationId });
      }

      case "confirm-email-change": {
        // Save the address the code went to, never one sent with the request.
        const result = await verifyOtp(String(body.verificationId ?? ""), String(body.code ?? "").trim(), { purpose: "verify-email", userId: user.id });
        if (!result.ok || !result.phone) return NextResponse.json({ ok: false, error: result.error ?? "Invalid code." });
        const newEmail = result.phone;
        const taken = await db.user.findUnique({ where: { email: newEmail } });
        if (taken && taken.id !== user.id) return NextResponse.json({ ok: false, error: "This email is already in use." });
        await db.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerified: true } });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
