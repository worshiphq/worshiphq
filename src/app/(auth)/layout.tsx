import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";
import { Aurora, GridBackdrop } from "@/components/marketing/aurora";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-base lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col overflow-hidden border-r border-line p-12 lg:flex">
        <Aurora />
        <GridBackdrop />
        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          {/* Huge centered logo */}
          <Image
            src="/logo.png"
            alt="WorshipHQ"
            width={320}
            height={320}
            className="h-64 w-auto object-contain drop-shadow-[0_20px_40px_rgba(13,115,119,0.15)] xl:h-80"
            priority
          />
          <p className="mt-10 max-w-md font-display text-2xl font-bold leading-snug text-ink xl:text-3xl">
            Every member. Every cedi.
            <br />
            <span className="text-primary">Every Sunday — sorted.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
            People, giving, attendance, events and SMS — the complete church
            management system, in one calm place.
          </p>
        </div>
        <div className="relative text-center text-xs text-ink-faint">
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
