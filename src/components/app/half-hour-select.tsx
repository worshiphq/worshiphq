"use client";

/**
 * Picks a time for an automatic message, on the hour or half past.
 *
 * Automatic messages go out when the scheduled job runs, which is every 30 minutes (the Supabase pg_cron job
 * whq-automations). Offering other minutes would promise a time we cannot keep. If that schedule changes, change
 * STEP here to match. A time saved before this picker existed shows as the slot it will really go out in: 8:20 shows
 * as 8:30.
 */
const STEP = 30;

const label = (h: number, m: number) => `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

const OPTIONS = Array.from({ length: (24 * 60) / STEP }, (_, i) => {
  const total = i * STEP;
  return { value: total, hour: Math.floor(total / 60), minute: total % 60, text: label(Math.floor(total / 60), total % 60) };
});

export function HalfHourSelect({ hour, minute, onChange, className, disabled }: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  const slot = Math.min(Math.ceil((hour * 60 + minute) / STEP) * STEP, 24 * 60 - STEP);
  return (
    <select
      value={slot}
      disabled={disabled}
      className={className}
      aria-label="Send time"
      onChange={(e) => {
        const total = Number(e.target.value);
        onChange(Math.floor(total / 60), total % 60);
      }}
    >
      {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
    </select>
  );
}
