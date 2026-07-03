import { Topbar } from "./Topbar";

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <Topbar title={title} />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-7xl animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
