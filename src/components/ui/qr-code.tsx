"use client";

import { QRCodeSVG } from "qrcode.react";

/** Branded QR code. Renders an SVG client-side (no external service). */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-2xl bg-white p-3 shadow-sm ring-1 ring-line">
      <QRCodeSVG value={value} size={size} level="M" fgColor="#0d7377" bgColor="#ffffff" />
    </div>
  );
}
