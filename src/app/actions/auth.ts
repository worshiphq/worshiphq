"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoUsers, SESSION_COOKIE, type Session } from "@/lib/auth";

/** Sign in (stub mode: any password works; unknown emails get an Owner demo session). */
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const match = demoUsers.find((u) => u.email === email);

  const session: Session = match
    ? { name: match.name, email: match.email, role: match.role, branch: match.branch, avatarName: match.avatarName }
    : {
        name: email ? email.split("@")[0] : "Pastor Daniel",
        email: email || "pastor@grace.org",
        role: "Owner",
        branch: "Accra Central",
        avatarName: "Daniel Mensah",
      };

  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/app");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}

/** Switch the active branch for the current session. */
export async function switchBranch(branch: string) {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const current: Partial<Session> = raw ? JSON.parse(raw) : {};
  store.set(SESSION_COOKIE, JSON.stringify({ ...current, branch }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
