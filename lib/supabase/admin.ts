import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client using the service_role key — bypasses RLS.
 * Never import this from a Client Component; it will leak the key to the browser bundle.
 *
 * Untyped (no Database generic) — our hand-written Database type doesn't have the
 * full shape supabase-js expects for insert/update generic inference (it collapses
 * to `never`). The sync code builds its own row shapes from lib/types.ts already.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
