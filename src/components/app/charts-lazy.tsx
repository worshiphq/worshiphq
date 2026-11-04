"use client";

import dynamic from "next/dynamic";

/**
 * The chart library is heavy and draws nothing useful on the server (charts measure the browser window), so charts
 * are loaded in the browser only. That takes the work off the server on the busiest pages, and takes the library out
 * of the download for anyone who never opens a page with a chart.
 */
const placeholder = () => <div className="h-64 w-full animate-pulse rounded-xl bg-surface-2" aria-hidden />;

export const TrendAreaChart = dynamic(() => import("./charts").then((m) => m.TrendAreaChart), { ssr: false, loading: placeholder });
export const AttendanceBarChart = dynamic(() => import("./charts").then((m) => m.AttendanceBarChart), { ssr: false, loading: placeholder });
export const FundDonut = dynamic(() => import("./charts").then((m) => m.FundDonut), { ssr: false, loading: placeholder });
export const MembershipDonut = dynamic(() => import("./charts").then((m) => m.MembershipDonut), { ssr: false, loading: placeholder });
