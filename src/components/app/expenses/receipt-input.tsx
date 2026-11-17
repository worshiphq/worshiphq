"use client";

import { Receipt } from "lucide-react";
import { PhotoInput } from "@/components/app/shared/photo-input";

/** The receipt photo field shared by Expenses, fuel, repairs and requests. Submitted as `receipt` (or `name`). */
export function ReceiptInput({ name = "receipt", initial, label = "Receipt" }: { name?: string; initial?: string | null; label?: string }) {
  return <PhotoInput name={name} initial={initial} label={label} icon={Receipt} wide takeLabel="Snap receipt" hint="A clear photo is enough" />;
}
