"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Starts a file download and shows a spinner while it is being prepared. */
export function DownloadButton({ url, children, variant = "primary" }: { url: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Same approach as the Export page: let the browser handle the file.
        window.location.href = url;
        setTimeout(() => setBusy(false), 2500);
      }}
    >
      {busy ? <><Loader2 className="animate-spin" /> Preparing file…</> : <><Download /> {children}</>}
    </Button>
  );
}
