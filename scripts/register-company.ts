/**
 * Registers (or updates) a company row so the sync job knows which sheet/tab(s) to read.
 *
 * A company can have more than one open-role tab (e.g. Kanerika has
 * JD_1/JD2/JD3) — pass all of them as one comma-separated string.
 *
 * Usage:
 *   npx tsx scripts/register-company.ts "Company Name" "<google-sheet-url>" "<tab-name>[,<tab-name>...]"
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "@/lib/supabase/admin";
import { extractSpreadsheetId } from "@/lib/sync/googleSheetsClient";

async function main() {
  const [name, sheetUrl, tabName] = process.argv.slice(2);
  if (!name || !sheetUrl || !tabName) {
    console.error(
      'Usage: npx tsx scripts/register-company.ts "Company Name" "<sheet-url>" "<tab-name>[,<tab-name>...]"',
    );
    process.exit(1);
  }

  const sheetId = extractSpreadsheetId(sheetUrl);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("companies")
    .upsert({ name, sheet_id: sheetId, sheet_url: sheetUrl, sheet_tab: tabName }, { onConflict: "name" })
    .select()
    .single();

  if (error) {
    console.error("Failed to register company:", error.message);
    process.exit(1);
  }

  console.log("Registered company:", data);
}

main();
