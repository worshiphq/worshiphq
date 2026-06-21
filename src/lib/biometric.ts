import { env } from "@/lib/env";

const url = new URL(env.NEXT_PUBLIC_APP_URL);

export const rpName = env.NEXT_PUBLIC_APP_NAME;
export const rpID = url.hostname;
export const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
