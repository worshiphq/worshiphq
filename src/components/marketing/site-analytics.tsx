import Script from "next/script";
import { env } from "@/lib/env";

export const GA_MEASUREMENT_ID = "G-X67JJ274C4";

/**
 * Google Analytics 4 for the public website and the sign-in / sign-up pages only. It is never loaded inside church
 * dashboards, so members' and churches' activity is never sent to Google. NEXT_PUBLIC_GA_ID, when set, replaces the ID below.
 * Ads features are switched off: no ad personalisation or Google signals.
 */
export function SiteAnalytics() {
  // The measurement ID is public (it appears in every page that loads the tag), so it lives here; the setting can override it.
  const id = (env.NEXT_PUBLIC_GA_ID ?? GA_MEASUREMENT_ID).trim();
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
    </>
  );
}
