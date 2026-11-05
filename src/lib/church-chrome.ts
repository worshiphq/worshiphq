import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * The few church fields every signed-in page needs (look, privacy, country, age). The layout and the plan check both
 * want them, and a page can ask several times in one request, so this reads the row once per request.
 */
export const getChurchChrome = cache((churchId: string) =>
  db.church.findUnique({
    where: { id: churchId },
    select: { suspended: true, logoUrl: true, accentColor: true, hideAmounts: true, createdAt: true, country: true },
  }),
);
