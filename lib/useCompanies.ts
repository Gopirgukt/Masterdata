"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSyncVersion } from "@/lib/useSyncVersion";
import type { Company } from "@/lib/types";

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const syncVersion = useSyncVersion();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("companies")
      .select("*")
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
  }, [syncVersion]);

  return companies;
}
