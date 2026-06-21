import { Wave } from "@/components/ui/wave";

export default function RootLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#faf8f4]">
      <div className="flex flex-col items-center gap-4">
        <Wave className="size-10 text-primary-bright" />
        <p className="text-sm font-medium text-[#6b6560]">Loading…</p>
      </div>
    </div>
  );
}
