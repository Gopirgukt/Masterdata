"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { LastSynced } from "@/components/LastSynced";
import { SyncNowButton } from "@/components/SyncNowButton";
import { useLastSync } from "@/lib/useLastSync";

export function TopHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((item) => item.href === pathname);
  const { info, loading, refetch } = useLastSync();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur md:h-16 md:gap-3 md:px-8">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open menu"
        className="-ml-1 rounded-md p-2 text-ink-secondary hover:bg-surface-hover hover:text-ink md:hidden"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
          <path d="M3 5.5h14M3 10h14M3 14.5h14" />
        </svg>
      </button>
      {current && <span className="hidden text-ink-muted sm:inline">{current.icon}</span>}
      <h1 className="min-w-0 truncate text-base font-semibold text-ink md:text-lg">{current?.label ?? "Dashboard"}</h1>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {/* "Updated … ago" is the first thing to give way on a narrow screen;
            the Sync now button stays. */}
        <span className="hidden sm:inline-flex">
          <LastSynced info={info} loading={loading} />
        </span>
        <SyncNowButton lastFinishedAt={info?.finishedAt ?? null} refetch={refetch} />
      </div>
    </header>
  );
}
