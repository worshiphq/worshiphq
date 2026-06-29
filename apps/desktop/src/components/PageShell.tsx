import { Topbar } from "./Topbar";

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <Topbar title={title} />
      <main className="flex-1 overflow-y-auto p-5">{children}</main>
    </div>
  );
}
