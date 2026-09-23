import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { brand } from "@/config/brand";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { FeedbackProvider } from "@/components/ui/feedback";
import { NavProgress } from "@/components/ui/nav-progress";
import "./globals.css";

// Clean, professional sans - the workhorse typeface for UI, body text and
// every app-dashboard heading (font-display utility).
const sans = Inter({
  subsets: ["latin"],
  variable: "--ff-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// A restrained serif accent reserved for the marketing site's big headline
// moments only (the press-display utility) - never used in the app dashboard.
const accent = Fraunces({
  subsets: ["latin"],
  variable: "--ff-accent",
  weight: ["500", "600"],
  style: ["normal"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--ff-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: {
    default: brand.productName,
    template: `%s · ${brand.shortName}`,
  },
  description: brand.description,
  applicationName: brand.name,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: brand.name },
  keywords: [
    "church management software",
    "church management system Ghana",
    "Mobile Money giving",
    "church app Africa",
    brand.name,
  ],
  openGraph: {
    type: "website",
    title: brand.productName,
    description: brand.supportingLine,
    siteName: brand.name,
    url: brand.url,
  },
  twitter: {
    card: "summary_large_image",
    title: brand.productName,
    description: brand.supportingLine,
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${accent.variable} ${mono.variable}`}
    >
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <FeedbackProvider>{children}</FeedbackProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
