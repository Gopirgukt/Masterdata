import { createBrowserClient } from "@supabase/ssr";

/**
 * Untyped (no Database generic) — see the same note on lib/supabase/admin.ts.
 * Every call site already casts query results to the concrete types in
 * lib/types.ts (`as unknown as X`), so the generic wasn't buying real safety
 * and its generic resolution breaks unpredictably as more tables are added.
 */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
