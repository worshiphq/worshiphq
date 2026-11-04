"use client";

import dynamic from "next/dynamic";

/** Reports is almost entirely charts, so it draws in the browser. The heavy chart library stays off the server and out of every other page's download. */
export const ReportsClient = dynamic(() => import("./reports-client").then((m) => m.ReportsClient), {
  ssr: false,
  loading: () => <div className="h-96 w-full animate-pulse rounded-2xl bg-surface-2" aria-hidden />,
});
