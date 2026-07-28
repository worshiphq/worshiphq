import { redirect } from "next/navigation";

// Volunteers has been merged into Rosters. Keep this route working for any
// old links/bookmarks by redirecting to the unified Rosters page.
export default function VolunteersPage() {
  redirect("/app/rosters");
}
