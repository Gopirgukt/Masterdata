/**
 * Runs the Google Sheets -> Supabase sync for every registered company.
 *
 * Usage:
 *   npx tsx scripts/sync.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { syncAllCompanies } from "@/lib/sync/runSync";

async function main() {
  const results = await syncAllCompanies();
  let skippedInactiveCount = 0;
  for (const r of results) {
    if (r.error) {
      console.error(`[${r.company}] ERROR: ${r.error}`);
      continue;
    }
    if (r.skippedInactive) {
      skippedInactiveCount++;
      continue;
    }
    console.log(
      `[${r.company}] inserted=${r.inserted} updated=${r.updated} unchanged=${r.unchanged} skipped(no name)=${r.skippedNoName}`,
    );
  }
  if (skippedInactiveCount > 0) {
    console.log(`(${skippedInactiveCount} companies skipped — sheet not modified in the last 7 days)`);
  }
}

main();
