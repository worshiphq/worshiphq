import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, googleEnabled, googleRedirectUri, startGoogle } from "@/lib/auth/google";

/** "Continue with Google": sends the browser to Google's account picker. */
export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/sign-in?error=google", req.url));
  const mode = req.nextUrl.searchParams.get("mode") === "signup" ? "signup" : "signin";
  const planRaw = req.nextUrl.searchParams.get("plan") ?? "";
  const plan = ["free", "starter", "pro", "max"].includes(planRaw) ? planRaw : undefined;

  const { url, cookie } = startGoogle(googleRedirectUri(req.nextUrl.origin), mode, plan);
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
