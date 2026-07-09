import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { brand } from "@/config/brand";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { FeedbackProvider } from "@/components/ui/feedback";
import { NavProgress } from "@/components/ui/nav-progress";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--ff-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--ff-sans",
  weight: ["300", "400", "500", "600", "700"],
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
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
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
