"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PAGE_SIZE = 1000;

/** Distinct, sorted, non-empty values for one candidates column — used to
 * populate filter dropdowns from real data rather than a guessed fixed list.
 *
 * Paginates explicitly: Supabase/PostgREST caps an unbounded select at 1000
 * rows by default, which was silently under-counting distinct values once
 * the candidates table passed that size (confirmed 2026-08-13). */
export function useDistinctValues(column: string) {
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadAll() {
      const unique = new Set<string>();
      let offset = 0;

      while (true) {
        const { data } = await supabase
          .from("candidates")
          .select(column)
          .not(column, "is", null)
          .range(offset, offset + PAGE_SIZE - 1);

        const rows = (data ?? []) as unknown as Record<string, string | null>[];
        for (const row of rows) {
          const v = (row[column] ?? "").trim();
          if (v) unique.add(v);
        }

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      if (!cancelled) {
        setValues(Array.from(unique).sort((a, b) => a.localeCompare(b)));
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [column]);

  return values;
}
