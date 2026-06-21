import { Wave } from "@/components/ui/wave";

export default function AdminLoading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Wave className="size-10 text-primary-bright" />
        <p className="text-sm font-medium text-slate-400">Loading…</p>
      </div>
    </div>
  );
}
