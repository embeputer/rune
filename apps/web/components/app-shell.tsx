"use client";

import { Menu } from "lucide-react";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar, type SidebarProps } from "@/components/sidebar";

interface AppShellProps {
  sidebar: SidebarProps;
  workspaceName: string;
  children: React.ReactNode;
}

export function AppShell({ sidebar, workspaceName, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const segments = useSelectedLayoutSegments();
  const segKey = segments.join("/");

  // Close drawer on every route change so a tap on a project/rune sends the
  // user straight to it without leaving the menu visible behind their content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: segKey is the trigger
  useEffect(() => {
    setOpen(false);
  }, [segKey]);

  // Lock background scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:grid md:min-h-screen md:grid-cols-[260px_1fr]">
      {/* Mobile-only top bar with hamburger trigger. Desktop hides this and
          relies on the sidebar always being visible in the grid column. */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="rune-sidebar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-elev)] hover:text-[var(--color-fg)]"
        >
          <Menu className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {workspaceName}
        </span>
      </header>

      {/* Backdrop — only mounted while the drawer is open on mobile. Tapping
          it (or pressing ESC, handled above) dismisses. */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        />
      )}

      <Sidebar
        {...sidebar}
        mobileOpen={open}
        onMobileClose={() => setOpen(false)}
      />

      <main className="flex min-h-screen min-w-0 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
