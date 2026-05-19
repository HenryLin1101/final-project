import { AppHeader } from "@/components/app-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <AppHeader />
      <main className="animate-page-in mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
