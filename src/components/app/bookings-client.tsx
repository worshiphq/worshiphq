"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, DoorOpen, Trash2, Clock, User, MapPin, Building, Plus, Pencil, Link2, Check, ExternalLink,
  Phone, Wallet, Camera, X, CircleDollarSign, Inbox, CheckCircle2, XCircle, Globe, Users, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { AccountSelect, type AccountOption } from "@/components/app/account-select";
import {
  deleteBooking, deleteFacility, saveFacility, saveBooking, decideBooking,
  recordBookingPayment, deleteBookingPayment, savePublicBookingSettings,
} from "@/app/actions/bookings";
import { binDeleted, confirmBinDelete } from "@/lib/recycle-bin-events";
import { formatCurrency } from "@/config/brand";
import { cn } from "@/lib/utils";

type FacilityRow = {
  id: string; name: string; capacity: number | null; location: string | null; description: string | null;
  imageUrl: string | null; rate: number | null; publicBookable: boolean;
};
type PaymentRow = { id: string; amount: number; method: string; accountName: string | null; date: string; note: string | null };
type BookingRow = {
  id: string; title: string; facilityId: string; facilityName: string; bookedBy: string;
  contactPhone: string | null; contactEmail: string | null; startTime: string; endTime: string;
  status: string; source: string; notes: string | null; amount: number | null; payments: PaymentRow[];
};

const METHOD_LABEL: Record<string, string> = { Cash: "Cash", MTN_MoMo: "MTN MoMo", Telecel_Cash: "Telecel Cash", AirtelTigo: "AirtelTigo", Card: "Card", Bank: "Bank transfer" };
const sel = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

const fmtDT = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** An ISO instant → the "YYYY-MM-DDTHH:MM" a datetime-local input wants. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const paidOf = (b: BookingRow) => b.payments.reduce((s, p) => s + p.amount, 0);

type Filter = "upcoming" | "pending" | "past" | "all";
const PAST_PAGE = 15;

export function BookingsClient({ facilities, bookings, accounts, canWrite, slug, isDemo, publicOn, publicNote }: {
  facilities: FacilityRow[]; bookings: BookingRow[]; accounts: AccountOption[]; canWrite: boolean;
  slug: string; isDemo: boolean; publicOn: boolean; publicNote: string;
}) {
  const [tab, setTab] = useState<"bookings" | "facilities">("bookings");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAST_PAGE);
  const [editingBooking, setEditingBooking] = useState<BookingRow | "new" | null>(null);
  const [editingFacility, setEditingFacility] = useState<FacilityRow | "new" | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useFeedback();

  const now = Date.now();
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const counts = {
    upcoming: bookings.filter((b) => b.status === "confirmed" && new Date(b.endTime).getTime() >= now).length,
    pending: pendingCount,
    past: bookings.filter((b) => b.status !== "pending" && new Date(b.endTime).getTime() < now).length,
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings
      .filter((b) => {
        const past = new Date(b.endTime).getTime() < Date.now();
        if (filter === "upcoming" && !(b.status === "confirmed" && !past)) return false;
        if (filter === "pending" && b.status !== "pending") return false;
        if (filter === "past" && !(b.status !== "pending" && past)) return false;
        if (facilityFilter && b.facilityId !== facilityFilter) return false;
        if (!q) return true;
        return [b.title, b.bookedBy, b.facilityName, b.contactPhone ?? ""].some((x) => x.toLowerCase().includes(q));
      })
      .sort((a, b) => (filter === "past" ? b.startTime.localeCompare(a.startTime) : a.startTime.localeCompare(b.startTime)));
  }, [bookings, filter, facilityFilter, search]);

  const visible = filter === "past" || filter === "all" ? list.slice(0, shown) : list;
  const payBooking = payFor ? bookings.find((b) => b.id === payFor) ?? null : null;

  const remove = (b: BookingRow) => {
    if (!confirmBinDelete(`Delete the booking "${b.title}"?${b.payments.length ? " The payments recorded for it are removed too." : ""}`)) return;
    const fd = new FormData();
    fd.set("id", b.id);
    start(async () => { await deleteBooking(fd); binDeleted(); router.refresh(); });
  };
  const removeFacility = (f: FacilityRow) => {
    if (!confirmBinDelete(`Delete "${f.name}" and all its bookings?`)) return;
    const fd = new FormData();
    fd.set("id", f.id);
    start(async () => { await deleteFacility(fd); binDeleted(); router.refresh(); });
  };
  const decide = (b: BookingRow, d: "confirmed" | "declined") =>
    start(async () => {
      const r = await decideBooking(b.id, d);
      if (r.ok) { toast(d === "confirmed" ? "Booking confirmed" : "Request declined", "success"); router.refresh(); }
      else toast(r.error, "error");
    });

  return (
    <div className="space-y-4">
      {canWrite && !isDemo && <BookingLinkCard slug={slug} on={publicOn} note={publicNote} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {([["bookings", `Bookings`], ["facilities", `Facilities (${facilities.length})`]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn("relative rounded-lg px-4 py-2 text-sm font-medium transition-colors", tab === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
            >
              {label}
              {k === "bookings" && pendingCount > 0 && <span className="ml-1.5 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>}
            </button>
          ))}
        </div>
        {canWrite && (
          tab === "bookings"
            ? <Button size="sm" onClick={() => setEditingBooking("new")} disabled={facilities.length === 0}><Plus className="size-4" /> Book a facility</Button>
            : <Button size="sm" onClick={() => setEditingFacility("new")}><Plus className="size-4" /> Add facility</Button>
        )}
      </div>

      {tab === "bookings" && (
        <>
          {pendingCount > 0 && filter !== "pending" && (
            <button onClick={() => setFilter("pending")} className="flex w-full items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-left text-sm text-warning">
              <Inbox className="size-4 shrink-0" />
              <span className="flex-1"><b>{pendingCount} booking request{pendingCount === 1 ? "" : "s"}</b> from your booking link {pendingCount === 1 ? "is" : "are"} waiting for you.</span>
              <span className="text-xs font-semibold underline">Review</span>
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
              {([["upcoming", "Upcoming", counts.upcoming], ["pending", "Requests", counts.pending], ["past", "Past", counts.past], ["all", "All", bookings.length]] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => { setFilter(k); setShown(PAST_PAGE); }}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", filter === k ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
                >
                  {label} <span className="text-ink-faint">({n})</span>
                </button>
              ))}
            </div>
            {facilities.length > 1 && (
              <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm">
                <option value="">All facilities</option>
                {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
              <Input placeholder="Search bookings…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
            </div>
          </div>

          {list.length === 0 ? (
            <Card className="p-12 text-center">
              <DoorOpen className="mx-auto size-10 text-ink-faint" />
              <p className="mt-3 text-sm text-ink-muted">
                {search || facilityFilter
                  ? "No bookings match."
                  : facilities.length === 0
                    ? "Add a facility first (a hall or room), then bookings can be made."
                    : filter === "pending" ? "No requests waiting." : filter === "past" ? "No past bookings." : "Nothing booked yet."}
              </p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {visible.map((b) => {
                const isPast = new Date(b.endTime).getTime() < now;
                const paid = paidOf(b);
                const balance = b.amount != null ? Math.max(0, b.amount - paid) : null;
                const pct = b.amount ? Math.min(100, Math.round((paid / b.amount) * 100)) : 0;
                return (
                  <Card key={b.id} className={cn("p-4", pending && "opacity-60", isPast && b.status !== "pending" && "opacity-80")}>
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", b.status === "pending" ? "bg-warning/15" : isPast ? "bg-ink-faint/10" : "bg-primary/10")}>
                        <DoorOpen className={cn("size-4", b.status === "pending" ? "text-warning" : isPast ? "text-ink-faint" : "text-primary")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{b.title}</span>
                          <Badge variant="default" className="text-[10px]">{b.facilityName}</Badge>
                          {b.status === "pending" && <Badge variant="default" className="bg-warning/15 text-[10px] text-warning">Request</Badge>}
                          {b.status === "declined" && <Badge variant="default" className="bg-danger/10 text-[10px] text-danger">Declined</Badge>}
                          {b.source === "public" && b.status !== "pending" && <span title="Booked through your public link"><Globe className="size-3 text-ink-faint" /></span>}
                          {isPast && b.status === "confirmed" && <Badge variant="default" className="bg-surface-2 text-[10px] text-ink-muted">Past</Badge>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-faint">
                          <span className="flex items-center gap-1"><Clock className="size-3" /> {fmtDT(b.startTime)} - {fmtDT(b.endTime)}</span>
                          <span className="flex items-center gap-1"><User className="size-3" /> {b.bookedBy}</span>
                          {b.contactPhone && <a href={`tel:${b.contactPhone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="size-3" /> {b.contactPhone}</a>}
                        </div>
                        {b.notes && <p className="mt-1 text-xs text-ink-muted">{b.notes}</p>}

                        {/* Money */}
                        {b.status !== "pending" && b.status !== "declined" && (
                          <div className="mt-2.5">
                            {b.amount != null ? (
                              <>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                  <span className="text-ink-muted">Charge <b className="text-ink">{formatCurrency(b.amount, { decimals: true })}</b></span>
                                  <span className="text-ink-muted">Paid <b className="text-success">{formatCurrency(paid, { decimals: true })}</b></span>
                                  {balance! > 0
                                    ? <span className="font-semibold text-danger">Balance {formatCurrency(balance!, { decimals: true })}</span>
                                    : <span className="flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="size-3.5" /> Paid in full</span>}
                                </div>
                                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2">
                                  <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-warning")} style={{ width: `${pct}%` }} />
                                </div>
                              </>
                            ) : paid > 0 ? (
                              <span className="text-xs text-ink-muted">Received <b className="text-success">{formatCurrency(paid, { decimals: true })}</b></span>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {canWrite && b.status === "pending" ? (
                          <div className="flex gap-1.5">
                            <Button size="sm" disabled={pending} onClick={() => decide(b, "confirmed")}><CheckCircle2 className="size-4" /> Confirm</Button>
                            <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(b, "declined")}><XCircle className="size-4" /> Decline</Button>
                          </div>
                        ) : canWrite && b.status === "confirmed" ? (
                          <Button size="sm" variant="secondary" onClick={() => setPayFor(b.id)}>
                            <Wallet className="size-4" /> {b.payments.length ? "Payments" : "Record payment"}
                          </Button>
                        ) : null}
                        {canWrite && (
                          <div className="flex gap-0.5">
                            <button onClick={() => setEditingBooking(b)} className="rounded-lg p-1.5 text-ink-faint hover:bg-primary/10 hover:text-primary" title="Edit"><Pencil className="size-4" /></button>
                            <button onClick={() => remove(b)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete"><Trash2 className="size-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {(filter === "past" || filter === "all") && list.length > shown && (
                <div className="pt-1 text-center">
                  <Button size="sm" variant="secondary" onClick={() => setShown(shown + PAST_PAGE)}>Show {Math.min(PAST_PAGE, list.length - shown)} more ({list.length - shown} left)</Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "facilities" && (
        facilities.length === 0 ? (
          <Card className="p-12 text-center">
            <Building className="mx-auto size-10 text-ink-faint" />
            <p className="mt-3 text-sm text-ink-muted">No facilities yet. Add the halls and rooms people can book.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((f) => (
              <Card key={f.id} className={cn("overflow-hidden p-0", pending && "opacity-60")}>
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imageUrl} alt={f.name} className="h-36 w-full object-cover" />
                ) : (
                  <div className="grid h-36 w-full place-items-center bg-surface-2"><Building className="size-8 text-ink-faint/60" /></div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-faint">
                        {f.capacity ? <span className="flex items-center gap-1"><Users className="size-3" /> {f.capacity}</span> : null}
                        {f.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {f.location}</span>}
                        {f.rate ? <span className="flex items-center gap-1"><CircleDollarSign className="size-3" /> {formatCurrency(f.rate)}</span> : null}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => setEditingFacility(f)} className="rounded-lg p-1.5 text-ink-faint hover:bg-primary/10 hover:text-primary" title="Edit facility"><Pencil className="size-4" /></button>
                        <button onClick={() => removeFacility(f)} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Delete facility"><Trash2 className="size-4" /></button>
                      </div>
                    )}
                  </div>
                  {f.description && <p className="mt-2 line-clamp-2 text-xs text-ink-muted">{f.description}</p>}
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <Globe className="size-3" /> {f.publicBookable ? "Shown on the booking link" : "Not on the booking link"}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {editingBooking && (
        <BookingDialog
          booking={editingBooking === "new" ? null : editingBooking}
          facilities={facilities}
          onClose={() => setEditingBooking(null)}
        />
      )}
      {editingFacility && (
        <FacilityDialog facility={editingFacility === "new" ? null : editingFacility} onClose={() => setEditingFacility(null)} />
      )}
      {payBooking && <PaymentDialog booking={payBooking} accounts={accounts} onClose={() => setPayFor(null)} />}
    </div>
  );
}

/* ────── Public booking link ────── */

function BookingLinkCard({ slug, on, note }: { slug: string; on: boolean; note: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState(on);
  const [text, setText] = useState(note);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, startSave] = useTransition();
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const url = `${origin}/book/${slug}`;

  const save = (nextOn: boolean, nextNote: string) => {
    const fd = new FormData();
    if (nextOn) fd.set("on", "on");
    fd.set("note", nextNote);
    startSave(async () => {
      const r = await savePublicBookingSettings(fd);
      if (r.ok) { toast(nextOn ? "Booking link is on" : "Booking link is off", "success"); router.refresh(); }
      else toast(r.error, "error");
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Link2 className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Booking link for outsiders</h3>
              <p className="mt-0.5 text-xs text-ink-faint">Anyone with the link can ask to book a hall or room. Requests wait here for you to confirm.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              {saving && <Loader2 className="size-4 animate-spin text-ink-faint" />}
              <span className="text-ink-muted">{enabled ? "On" : "Off"}</span>
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(e) => { setEnabled(e.target.checked); save(e.target.checked, text); }}
                className="size-4 accent-primary"
              />
            </label>
          </div>
          {enabled && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input value={url} readOnly className="min-w-0 flex-1 font-mono text-xs" />
                <Button type="button" variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
                  {copied ? <Check className="size-4" /> : <Link2 className="size-4" />} {copied ? "Copied" : "Copy"}
                </Button>
                <a href={url} target="_blank" rel="noreferrer"><Button type="button" variant="ghost" size="sm"><ExternalLink className="size-4" /> Preview</Button></a>
              </div>
              <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-xs font-medium text-primary hover:underline">
                {open ? "Hide" : "Add"} a message for people (rates, rules, how to pay)
              </button>
              {open && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    maxLength={1500}
                    placeholder="e.g. Main hall is GH₵800 per day. A 50% deposit confirms your booking. No loud music after 10pm."
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25"
                  />
                  <Button size="sm" disabled={saving} onClick={() => save(enabled, text)}>{saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save message"}</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ────── Add / edit a booking ────── */

function BookingDialog({ booking, facilities, onClose }: { booking: BookingRow | null; facilities: FacilityRow[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [facilityId, setFacilityId] = useState(booking?.facilityId ?? facilities[0]?.id ?? "");
  const [amount, setAmount] = useState(booking?.amount != null ? String(booking.amount) : "");
  const [amountTouched, setAmountTouched] = useState(booking?.amount != null);

  const pickFacility = (id: string) => {
    setFacilityId(id);
    const f = facilities.find((x) => x.id === id);
    if (!amountTouched && f?.rate) setAmount(String(f.rate));
  };

  const submit = (fd: FormData) => {
    setError("");
    if (booking) fd.set("id", booking.id);
    start(async () => {
      const r = await saveBooking(fd);
      if (r.ok) { toast(booking ? "Booking updated" : "Booking saved", "success"); router.refresh(); onClose(); }
      else setError(r.error);
    });
  };

  return (
    <Modal open onClose={pending ? () => {} : onClose} title={booking ? "Edit booking" : "Book a facility"} description="Confirmed bookings show on your calendar so leaders can see them.">
      <form action={submit} className="space-y-3.5">
        <div><Label htmlFor="b-title">What is it for?</Label><Input id="b-title" name="title" defaultValue={booking?.title} placeholder="e.g. Wedding reception" required /></div>
        <div>
          <Label htmlFor="b-fac">Facility</Label>
          <select id="b-fac" name="facilityId" value={facilityId} onChange={(e) => pickFacility(e.target.value)} className={sel} required>
            {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}{f.capacity ? ` (${f.capacity})` : ""}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="b-by">Booked by</Label><Input id="b-by" name="bookedBy" defaultValue={booking?.bookedBy} placeholder="Name or group" required /></div>
          <div><Label htmlFor="b-ph">Phone (optional)</Label><Input id="b-ph" name="contactPhone" type="tel" defaultValue={booking?.contactPhone ?? ""} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="b-s">Start</Label><Input id="b-s" name="startTime" type="datetime-local" defaultValue={booking ? toLocalInput(booking.startTime) : ""} required /></div>
          <div><Label htmlFor="b-e">End</Label><Input id="b-e" name="endTime" type="datetime-local" defaultValue={booking ? toLocalInput(booking.endTime) : ""} required /></div>
        </div>
        <div>
          <Label htmlFor="b-amt">Charge (₵, optional)</Label>
          <Input id="b-amt" name="amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true); }} placeholder="Leave empty if free" />
          <p className="mt-1 text-[11px] text-ink-faint">Set a price to track what has been paid and what is still owed.</p>
        </div>
        <div><Label htmlFor="b-n">Notes (optional)</Label><Input id="b-n" name="notes" defaultValue={booking?.notes ?? ""} placeholder="Setup, sound system, number of guests…" /></div>
        {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={pending}>{pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : booking ? "Save changes" : "Save booking"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ────── Add / edit a facility (with photo) ────── */

/** Shrink a photo in the browser so it uploads fast and stays small. */
function resizeToDataUrl(file: File, maxDim = 1100, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a photo."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Couldn't process the photo."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function FacilityDialog({ facility, onClose }: { facility: FacilityRow | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [image, setImage] = useState<string | null>(facility?.imageUrl ?? null);
  const [changed, setChanged] = useState(false);
  const [busyImg, setBusyImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusyImg(true);
    try { setImage(await resizeToDataUrl(file)); setChanged(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusyImg(false); }
  };

  const submit = (fd: FormData) => {
    setError("");
    if (facility) fd.set("id", facility.id);
    if (changed) { fd.set("imageChanged", "1"); fd.set("imageUrl", image ?? ""); }
    start(async () => {
      const r = await saveFacility(fd);
      if (r.ok) { toast(facility ? "Facility updated" : "Facility added", "success"); router.refresh(); onClose(); }
      else setError(r.error);
    });
  };

  return (
    <Modal open onClose={pending ? () => {} : onClose} title={facility ? "Edit facility" : "Add facility"} description="A hall, room or space people can book.">
      <form action={submit} className="space-y-3.5">
        <div>
          <Label>Photo</Label>
          <div className="mt-1 flex items-center gap-3">
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-ink-faint"><Building className="size-6" /></div>
              )}
              {busyImg && <div className="absolute inset-0 grid place-items-center bg-black/30"><Loader2 className="size-5 animate-spin text-white" /></div>}
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={busyImg}><Camera className="size-4" /> {image ? "Change photo" : "Upload photo"}</Button>
              {image && <button type="button" onClick={() => { setImage(null); setChanged(true); }} className="flex items-center gap-1 text-xs text-ink-faint hover:text-danger"><X className="size-3" /> Remove</button>}
            </div>
          </div>
        </div>
        <div><Label htmlFor="f-name">Name</Label><Input id="f-name" name="name" defaultValue={facility?.name} placeholder="e.g. Main hall" required /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="f-cap">Capacity</Label><Input id="f-cap" name="capacity" type="number" min="0" defaultValue={facility?.capacity ?? ""} placeholder="People it holds" /></div>
          <div><Label htmlFor="f-rate">Usual price (₵)</Label><Input id="f-rate" name="rate" type="number" min="0" step="0.01" defaultValue={facility?.rate ?? ""} placeholder="Optional" /></div>
        </div>
        <div><Label htmlFor="f-loc">Location</Label><Input id="f-loc" name="location" defaultValue={facility?.location ?? ""} placeholder="Building or floor" /></div>
        <div>
          <Label htmlFor="f-desc">Description</Label>
          <textarea id="f-desc" name="description" rows={2} defaultValue={facility?.description ?? ""} placeholder="Seating, sound system, kitchen, air conditioning…" className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/25" />
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
          <span><span className="font-medium">Show on the public booking link</span><span className="block text-xs text-ink-faint">Outsiders can ask to book it.</span></span>
          <input type="checkbox" name="publicBookable" defaultChecked={facility?.publicBookable ?? true} className="size-4 accent-primary" />
        </label>
        {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={pending || busyImg}>{pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : facility ? "Save changes" : "Add facility"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ────── Payments received ────── */

function PaymentDialog({ booking, accounts, onClose }: { booking: BookingRow; accounts: AccountOption[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const paid = paidOf(booking);
  const balance = booking.amount != null ? Math.max(0, booking.amount - paid) : null;
  const defaultAccount = accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(defaultAccount);
  const [amount, setAmount] = useState(balance ? String(balance) : "");
  const [method, setMethod] = useState("Cash");

  const add = (fd: FormData) => {
    setError("");
    fd.set("bookingId", booking.id);
    fd.set("accountId", accountId);
    fd.set("method", method);
    start(async () => {
      const r = await recordBookingPayment(fd);
      if (r.ok) { toast("Payment recorded", "success"); router.refresh(); setAmount(""); }
      else setError(r.error);
    });
  };
  const removePay = (id: string) => {
    if (!confirmBinDelete("Remove this payment?")) return;
    start(async () => {
      const r = await deleteBookingPayment(id);
      if (r.ok) { binDeleted(); router.refresh(); } else toast(r.error, "error");
    });
  };

  return (
    <Modal open onClose={pending ? () => {} : onClose} title="Payments" description={`${booking.title} - ${booking.bookedBy}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-ink-faint">Charge</div><div className="font-display text-sm font-bold">{booking.amount != null ? formatCurrency(booking.amount, { decimals: true }) : "-"}</div></div>
          <div className="rounded-xl bg-success/10 p-2.5"><div className="text-[11px] text-ink-faint">Paid</div><div className="font-display text-sm font-bold text-success">{formatCurrency(paid, { decimals: true })}</div></div>
          <div className={cn("rounded-xl p-2.5", balance ? "bg-danger/10" : "bg-surface-2")}><div className="text-[11px] text-ink-faint">Balance</div><div className={cn("font-display text-sm font-bold", balance ? "text-danger" : "")}>{balance != null ? formatCurrency(balance, { decimals: true }) : "-"}</div></div>
        </div>

        {booking.payments.length > 0 && (
          <ul className="divide-y divide-line-soft rounded-xl border border-line">
            {booking.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-success">{formatCurrency(p.amount, { decimals: true })}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {METHOD_LABEL[p.method] ?? p.method}{p.accountName ? ` · into ${p.accountName}` : ""} · {new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <button onClick={() => removePay(p.id)} disabled={pending} className="rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" title="Remove payment"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}

        <form action={add} className="space-y-3 rounded-xl border border-line p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Record a payment</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-amt">Amount (₵)</Label>
              <Input id="p-amt" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="p-m">Paid by</Label>
              <select id="p-m" value={method} onChange={(e) => setMethod(e.target.value)} className={sel}>
                {Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label="Goes into account" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="p-d">Date</Label><Input id="p-d" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div><Label htmlFor="p-n">Note (optional)</Label><Input id="p-n" name="note" placeholder="e.g. deposit" /></div>
          </div>
          {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? <><Loader2 className="size-4 animate-spin" /> Recording…</> : "Record payment"}</Button>
          <p className="text-[11px] text-ink-faint">It is added to that account as income under “Facility hire”, so your accounting stays right.</p>
        </form>

        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
