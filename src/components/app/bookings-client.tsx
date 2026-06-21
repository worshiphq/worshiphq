"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search, DoorOpen, Trash2, Clock, User, MapPin, Building,
} from "lucide-react";
import { deleteBooking, deleteFacility } from "@/app/actions/bookings";

type FacilityRow = {
  id: string;
  name: string;
  capacity: number | null;
  location: string | null;
};

type BookingRow = {
  id: string;
  title: string;
  facilityName: string;
  bookedBy: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function BookingsClient({
  facilities,
  bookings,
}: {
  facilities: FacilityRow[];
  bookings: BookingRow[];
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"bookings" | "facilities">("bookings");
  const [pending, start] = useTransition();

  const filteredBookings = bookings.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return b.title.toLowerCase().includes(q) || b.bookedBy.toLowerCase().includes(q) || b.facilityName.toLowerCase().includes(q);
  });

  const handleDeleteBooking = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteBooking(fd));
  };

  const handleDeleteFacility = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    start(() => deleteFacility(fd));
  };

  const now = new Date();

  return (
    <div className="mt-5 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("bookings")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "bookings" ? "bg-brand text-white" : "bg-surface-raised text-ink-muted"}`}
        >
          Bookings ({bookings.length})
        </button>
        <button
          onClick={() => setTab("facilities")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "facilities" ? "bg-brand text-white" : "bg-surface-raised text-ink-muted"}`}
        >
          Facilities ({facilities.length})
        </button>
      </div>

      {tab === "bookings" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <Input
              placeholder="Search bookings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredBookings.length === 0 ? (
            <Card className="p-12 text-center">
              <DoorOpen className="mx-auto size-10 text-ink-faint" />
              <p className="mt-3 text-sm text-ink-muted">
                {search ? "No bookings match your search." : "No bookings yet. Add facilities first, then create bookings."}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredBookings.map((b) => {
                const isPast = new Date(b.endTime) < now;
                return (
                  <Card key={b.id} className={`p-4 ${pending ? "opacity-60" : ""} ${isPast ? "opacity-70" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${isPast ? "bg-ink-faint/10" : "bg-brand/10"}`}>
                        <DoorOpen className={`size-4 ${isPast ? "text-ink-faint" : "text-brand"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{b.title}</span>
                          <Badge variant="default" className="text-[10px]">{b.facilityName}</Badge>
                          {isPast && <Badge variant="default" className="bg-gray-200 text-[10px] text-gray-600">Past</Badge>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-ink-faint">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatDateTime(b.startTime)} — {formatDateTime(b.endTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="size-3" /> {b.bookedBy}
                          </span>
                        </div>
                        {b.notes && <p className="mt-1 text-xs text-ink-muted">{b.notes}</p>}
                      </div>
                      <button
                        onClick={() => handleDeleteBooking(b.id)}
                        className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "facilities" && (
        <>
          {facilities.length === 0 ? (
            <Card className="p-12 text-center">
              <Building className="mx-auto size-10 text-ink-faint" />
              <p className="mt-3 text-sm text-ink-muted">
                No facilities registered yet. Add rooms or spaces to enable bookings.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {facilities.map((f) => (
                <Card key={f.id} className={`p-4 ${pending ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">
                        {f.capacity && <span>Capacity: {f.capacity}</span>}
                        {f.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" /> {f.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFacility(f.id)}
                      className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
                      title="Delete facility"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
