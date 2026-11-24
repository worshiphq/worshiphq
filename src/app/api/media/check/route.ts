import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_CORS, claimSeat, getMediaEntitlement, signMediaLicence, verifyMediaToken } from "@/lib/media-license";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MEDIA_CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: MEDIA_CORS });

/** The Media app checks in when it's online: is the subscription still active, and is this computer still signed in? */
export async function GET(req: Request) {
  try {
    const auth = await verifyMediaToken(req.headers.get("authorization"));
    if (!auth) return json({ error: "Please sign in again.", code: "signed_out" }, 401);

    let device = await db.mediaDevice.findUnique({ where: { churchId_deviceId: { churchId: auth.cid, deviceId: auth.did } } });
    const ent = await getMediaEntitlement(auth.cid);
    if (ent.active && !device) {
      // Signed in before Media was paid for (no place was taken then), or its place was given to another computer.
      // Take a place now if there is room; when all are in use, this computer is signed out.
      const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 60) || "This computer";
      const seat = await claimSeat({ churchId: auth.cid, deviceId: auth.did, name, userId: auth.uid, seats: ent.seats });
      if (!seat.ok) {
        return json({ error: "This computer was signed out of WorshipHQ Live. Please sign in again.", code: "signed_out" }, 401);
      }
      device = await db.mediaDevice.findUnique({ where: { churchId_deviceId: { churchId: auth.cid, deviceId: auth.did } } });
    }
    if (device) await db.mediaDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

    const church = await db.church.findUnique({ where: { id: auth.cid }, select: { name: true } });
    const licence = device ? await signMediaLicence({ churchId: auth.cid, churchName: church?.name ?? "", deviceId: auth.did, ent }) : null;
    return json({ media: ent, church: { id: auth.cid, name: church?.name ?? "" }, licence, checkedAt: new Date().toISOString() });
  } catch (e) {
    console.error("[media/check]", e);
    return json({ error: "Something went wrong." }, 500);
  }
}
