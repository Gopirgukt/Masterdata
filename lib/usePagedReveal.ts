"use client";

import { useEffect, useState } from "react";

/**
 * Reveals items in pages instead of rendering the whole list at once — cuts
 * initial render cost on large tables. `resetKey` (e.g. a filter's serialized
 * value) snaps the count back to `pageSize` when it changes.
 */
export function usePagedReveal<T>(items: T[], pageSize = 20, resetKey?: unknown) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    showMore: () => setVisibleCount((c) => c + pageSize),
    total: items.length,
    visibleCount: Math.min(visibleCount, items.length),
  };
}
