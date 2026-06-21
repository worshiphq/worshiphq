import Link from "next/link";
import { Quote } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Aurora, GridBackdrop } from "@/components/marketing/aurora";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-base lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <Aurora />
        <GridBackdrop />
        <div className="relative">
          <Logo href="/" size="lg" />
        </div>
        <div className="relative max-w-md">
          <Quote className="size-8 text-primary/50" />
          <p className="mt-4 font-display text-2xl font-medium leading-snug">
            We moved 1,200 members onto WorshipHQ in a weekend. Mobile Money giving alone has
            transformed our offerings.
          </p>
          <p className="mt-4 text-sm text-ink-muted">Rev. Daniel Mensah · Grace Temple, Accra</p>
        </div>
        <div className="relative text-xs text-ink-faint">
          © {new Date().getFullYear()} {brand.productName}
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-bubbly relative flex flex-col items-center justify-center px-5 py-12">
        <div className="absolute left-5 top-5 lg:hidden">
          <Logo href="/" />
        </div>
        <div className="w-full max-w-sm">{children}</div>
        <div className="mt-8 text-center text-xs text-ink-faint">
          <Link href="/" className="hover:text-ink">
            ← Back to website
          </Link>
        </div>
      </div>
    </div>
  );
}
