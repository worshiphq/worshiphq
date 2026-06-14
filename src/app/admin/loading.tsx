import { Spinner } from "@/components/ui/spinner";

export default function AdminLoading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" className="text-teal-400" />
        <p className="text-sm font-medium text-slate-400">Loading…</p>
      </div>
    </div>
  );
}
