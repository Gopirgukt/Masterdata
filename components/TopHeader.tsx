"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { LastSynced } from "@/components/LastSynced";

export function TopHeader() {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => item.href === pathname);

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/80 backdrop-blur px-8">
      {current && <span className="text-ink-muted">{current.icon}</span>}
      <h1 className="text-lg font-semibold text-ink">{current?.label ?? "Dashboard"}</h1>
      <div className="ml-auto">
        <LastSynced />
      </div>
    </header>
  );
}
