import { requireModule } from "@/lib/auth";
import { getDevices } from "@/app/actions/devices";
import { canManage } from "@/lib/permissions";
import { DevicesClient } from "@/components/app/devices-client";

export const metadata = { title: "Biometric devices" };

export default async function DevicesPage() {
  const session = await requireModule("attendance");
  const data = await getDevices();
  return <DevicesClient data={{ ...data, canManage: data.canManage && canManage(session, "attendance") }} />;
}
