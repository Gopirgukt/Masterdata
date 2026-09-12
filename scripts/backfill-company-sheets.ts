import { config } from "dotenv";
config({ path: ".env.local" });
import { syncAllCompanySheets } from "../lib/sync/syncCompanySheets";

async function main() {
  const start = Date.now();
  const results = await syncAllCompanySheets({ force: true, concurrency: 1 });

  const withMatches = results.filter((r) => r.matched > 0);
  const withUpdates = results.filter((r) => r.updated > 0);
  const errors = results.filter((r) => r.error);

  console.log("Total companies processed:", results.length);
  console.log("Companies with at least one name match:", withMatches.length);
  console.log("Companies with at least one field updated:", withUpdates.length);
  console.log("Total candidates updated:", withUpdates.reduce((s, r) => s + r.updated, 0));
  console.log("\n--- Updated ---");
  for (const r of withUpdates) console.log(`${r.company}: matched ${r.matched}, updated ${r.updated}`);
  console.log("\n--- Errors ---");
  for (const r of errors) console.log(`${r.company}: ${r.error}`);
  console.log("\nElapsed:", (Date.now() - start) / 1000, "s");
}
main();
