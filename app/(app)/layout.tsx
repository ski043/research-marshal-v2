import { AppShell } from "@/components/app/app-shell";
import { Sidebar } from "@/components/app/sidebar";

/** The frame of the app itself: the sidebar with the history beside every screen. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="fixed top-2 left-2 z-[60] -translate-y-16 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 focus:translate-y-0"
      >
        Skip to the content
      </a>
      <AppShell sidebar={<Sidebar />}>{children}</AppShell>
    </>
  );
}
