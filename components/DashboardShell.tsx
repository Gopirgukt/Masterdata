"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";
import { GlobalSyncAlert } from "@/components/GlobalSyncAlert";

/** Client wrapper for the dashboard chrome so the sidebar can be a slide-in
 * drawer on phones (opened from the header's menu button) while staying a
 * fixed column from the `md` breakpoint up. Before this (confirmed
 * 2026-10-10) the 256px sidebar never collapsed, leaving ~134px for content
 * on a 390px phone. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating, and on Escape.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-page">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <TopHeader onOpenNav={() => setNavOpen(true)} />
        <GlobalSyncAlert />
        <main className="flex-1 overflow-x-auto overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
