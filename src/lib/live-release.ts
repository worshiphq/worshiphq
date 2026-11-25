import "server-only";
import { getObject } from "@/lib/storage";

/** Has a WorshipHQ Live installer been published (scripts/publish-media-release.mjs)? */
export async function liveInstallerReady(): Promise<boolean> {
  try {
    const r = JSON.parse((await getObject("media-releases/latest.json")).toString("utf8")) as { platforms?: Record<string, { key?: string }> };
    return !!r.platforms?.["windows-x86_64"]?.key;
  } catch {
    return false;
  }
}
