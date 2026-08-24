/**
 * Backfills companies.company_sheet_url/company_sheet_id from the "Main" tab's
 * "Company Sheet Link" column (distinct from "Internal Sheet Link", which is
 * what companies.sheet_id already holds). Only touches companies already
 * registered — doesn't register new ones.
 *
 * Usage:
 *   npx tsx scripts/capture-company-sheet-links.ts "<main-sheet-url>" "<tab-name>"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSheetsClient, extractSpreadsheetId } from "@/lib/sync/googleSheetsClient";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const [mainSheetUrl, tabName] = process.argv.slice(2);
  if (!mainSheetUrl || !tabName) {
    console.error('Usage: npx tsx scripts/capture-company-sheet-links.ts "<main-sheet-url>" "<tab-name>"');
    process.exit(1);
  }

  const sheets = getSheetsClient();
  const mainSpreadsheetId = extractSpreadsheetId(mainSheetUrl);
  const supabase = createAdminClient();

  const headerRow = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: `${tabName}!1:1` });
  const headers = (headerRow.data.values?.[0] ?? []).map((h) => (h ?? "").trim());
  const companyNameCol = headers.findIndex((h) => h.toLowerCase() === "company name");
  const companySheetCol = headers.findIndex((h) => h.toLowerCase() === "company sheet link");

  if (companyNameCol < 0 || companySheetCol < 0) {
    console.error("Could not find 'Company Name' or 'Company Sheet Link' columns.");
    process.exit(1);
  }

  const dataRows = await sheets.spreadsheets.values.get({ spreadsheetId: mainSpreadsheetId, range: `${tabName}!2:100000` });
  const rows = dataRows.data.values ?? [];

  const links = new Map<string, string>();
  for (const row of rows) {
    const name = (row[companyNameCol] ?? "").trim();
    const link = (row[companySheetCol] ?? "").trim();
    if (!name || !link) continue;
    if (!links.has(name)) links.set(name, link);
  }

  const { data: existingCompanies } = await supabase.from("companies").select("id, name");
  const byName = new Map((existingCompanies ?? []).map((c) => [c.name, c.id]));

  let updated = 0;
  let notRegistered = 0;
  for (const [name, link] of links) {
    const companyId = byName.get(name);
    if (!companyId) {
      notRegistered++;
      continue;
    }
    const companySheetId = extractSpreadsheetId(link);
    const { error } = await supabase
      .from("companies")
      .update({ company_sheet_url: link, company_sheet_id: companySheetId })
      .eq("id", companyId);
    if (error) {
      console.log(`[ERROR] ${name}: ${error.message}`);
      continue;
    }
    updated++;
  }

  console.log(`Done. ${updated} companies updated with their Company Sheet Link, ${notRegistered} not registered (skipped).`);
}

main();
