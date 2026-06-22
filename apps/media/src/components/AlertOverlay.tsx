import { useEffect, useState } from "react";

export interface AlertMessage {
  id: string;
  text: string;
  type: "info" | "urgent" | "nursery";
  duration: number;
}

export function AlertOverlay({ alert }: { alert: AlertMessage | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alert) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (alert.duration > 0) {
      const timer = setTimeout(() => setVisible(false), alert.duration * 1000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  if (!alert || !visible) return null;

  const colors = {
    info: { bg: "rgba(99,102,241,0.95)", text: "#ffffff" },
    urgent: { bg: "rgba(239,68,68,0.95)", text: "#ffffff" },
    nursery: { bg: "rgba(245,158,11,0.95)", text: "#000000" },
  };

  const style = colors[alert.type];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center p-4">
      <div
        className="animate-in slide-in-from-top rounded-xl px-8 py-4 shadow-2xl"
        style={{
          backgroundColor: style.bg,
          backdropFilter: "blur(8px)",
        }}
      >
        <p
          className="text-center text-2xl font-bold"
          style={{ color: style.text }}
        >
          {alert.text}
        </p>
      </div>
    </div>
  );
}

export function CountdownTimer({
  seconds,
  label,
  onComplete,
}: {
  seconds: number;
  label?: string;
  onComplete?: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete]);

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="text-center">
        {label && (
          <p className="mb-4 text-2xl font-medium text-white/60">{label}</p>
        )}
        <p
          className="tabular-nums text-white"
          style={{
            fontSize: "clamp(80px, 15vw, 200px)",
            fontWeight: 700,
            textShadow: "0 4px 30px rgba(0,0,0,0.8)",
          }}
        >
          {String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
      </div>
    </div>
  );
}
