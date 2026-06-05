"use client";

import { useState } from "react";
import { MessageSquare, Mail, Send, Users, Check, BarChart3, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { campaigns } from "@/lib/demo/data";
import { formatDate, cn } from "@/lib/utils";

const segments = ["All members (1,240)", "Active givers (612)", "Worship team (42)", "First-time visitors (34)"];

export default function CommunicationsPage() {
  const [channel, setChannel] = useState<"SMS" | "Email">("SMS");
  const [message, setMessage] = useState("Shalom! Join us this Sunday at 8am for our Celebration Service. God bless you! — Grace Temple");
  const [sent, setSent] = useState(false);

  return (
    <div>
      <PageHeader title="Communications" description="Reach your whole church — or a smart segment — by SMS and email." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Messages this month" value={4320} change={11.4} icon={MessageSquare} />
        <StatCard label="SMS delivery rate" value={98} suffix="%" change={0.6} icon={Smartphone} />
        <StatCard label="Email open rate" value={62} suffix="%" change={3.8} icon={Mail} />
        <StatCard label="People reached" value={2410} change={8.7} icon={Users} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* Composer */}
        <Card className="lg:col-span-2">
          <div className="border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">New broadcast</h3>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2">
              {(["SMS", "Email"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                    channel === c ? "border-primary/50 bg-primary/10 text-ink" : "border-line text-ink-muted hover:bg-surface-2",
                  )}
                >
                  {c === "SMS" ? <Smartphone className="size-4" /> : <Mail className="size-4" />} {c}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">Send to</label>
              <select className="flex h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                {segments.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-ink-muted">Message</span>
                {channel === "SMS" && <span className="text-xs text-ink-faint">{message.length}/160 · {Math.ceil(message.length / 160)} SMS</span>}
              </div>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-28" />
            </div>

            {sent ? (
              <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                <Check className="size-4" /> Broadcast queued (logged in stub mode — add an SMS key to send for real).
              </div>
            ) : (
              <Button className="w-full" onClick={() => setSent(true)}>
                <Send /> Send {channel} broadcast
              </Button>
            )}
            <p className="text-center text-xs text-ink-faint">Sender ID: WorshipHQ · GHS billing</p>
          </div>
        </Card>

        {/* History */}
        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="font-display text-lg font-semibold">Campaign history</h3>
            <Badge variant="default"><BarChart3 className="size-3" /> Analytics</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="p-4 font-medium">Campaign</th>
                  <th className="p-4 font-medium">Channel</th>
                  <th className="p-4 font-medium">Delivered</th>
                  <th className="hidden p-4 font-medium sm:table-cell">Date</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-0">
                    <td className="p-4 font-medium">{c.name}</td>
                    <td className="p-4">
                      <Badge variant={c.channel === "SMS" ? "primary" : "info"}>{c.channel}</Badge>
                    </td>
                    <td className="p-4 text-ink-muted">
                      {c.sent > 0 ? `${c.delivered}/${c.sent}` : "—"}
                      {c.channel === "Email" && c.opened > 0 && <span className="ml-1 text-xs text-ink-faint">({c.opened} opened)</span>}
                    </td>
                    <td className="hidden p-4 text-ink-muted sm:table-cell">{formatDate(c.date)}</td>
                    <td className="p-4">
                      <Badge variant={c.status === "Sent" ? "success" : "warning"}>{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
