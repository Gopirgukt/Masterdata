"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-y-0 left-0 w-64 shrink-0 border-r border-line bg-surface py-6 flex flex-col overflow-y-auto">
      <div className="flex items-center gap-2 px-5 mb-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink text-sm font-semibold">R</span>
        <span className="text-sm font-semibold text-ink">Recruiting Dashboard</span>
      </div>
      <ul className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent text-accent-ink font-medium"
                    : "text-ink-secondary hover:bg-surface-hover hover:text-ink"
                }`}
              >
                <span className={active ? "text-accent-ink" : "text-ink-muted"}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
