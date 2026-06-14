import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#faf8f4]">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" className="text-[#0d9488]" />
        <p className="text-sm font-medium text-[#6b6560]">Loading…</p>
      </div>
    </div>
  );
}
