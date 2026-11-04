import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { brand } from "@/config/brand";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { FeedbackProvider } from "@/components/ui/feedback";
import { NavProgress } from "@/components/ui/nav-progress";
import { KeyboardLayer } from "@/components/a11y/keyboard-layer";
import "./globals.css";

// Clean, professional sans - the one typeface for the whole product: UI, body
// text, app headings and marketing headlines (font-display / press-display).
const sans = Inter({
  subsets: ["latin"],
  variable: "--ff-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Kept in the repo: fetching JetBrains Mono from Google at build time started failing every deployment on 4 Nov 2026.
const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--ff-mono",
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
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="antialiased">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <FeedbackProvider>{children}</FeedbackProvider>
        <KeyboardLayer />
        <ServiceWorker />
      </body>
    </html>
  );
}
