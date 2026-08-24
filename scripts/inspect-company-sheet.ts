/**
 * Reusable helper for onboarding a new company: lists every tab in a
 * spreadsheet plus its header row, so we can spot which tab holds the
 * candidate rows (tab names vary per company — confirmed 2026-08-11).
 *
 * Usage:
 *   npx tsx scripts/inspect-company-sheet.ts "<sheet-url-or-id>" [tabName] [range]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSheetsClient, extractSpreadsheetId } from "@/lib/sync/googleSheetsClient";

async function main() {
  const [urlOrId, tabName, range] = process.argv.slice(2);
  if (!urlOrId) {
    console.error('Usage: npx tsx scripts/inspect-company-sheet.ts "<sheet-url-or-id>" [tabName] [range]');
    process.exit(1);
  }

  const spreadsheetId = extractSpreadsheetId(urlOrId);
  const sheets = getSheetsClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  console.log("Spreadsheet title:", meta.data.properties?.title);
  console.log(
    "Tabs:",
    meta.data.sheets?.map((s) => ({ title: s.properties?.title, sheetId: s.properties?.sheetId })),
  );

  if (tabName) {
    // No column bound by default — some tabs run past column AZ (confirmed:
    // Tofler's "JD _ 1(Fullstack)"), which silently truncated headers before.
    const values = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range ? `${tabName}!${range}` : tabName,
    });
    console.log(`\n--- ${tabName} ---`);
    console.log(JSON.stringify(values.data.values, null, 2));
  } else {
    for (const s of meta.data.sheets ?? []) {
      const title = s.properties?.title;
      if (!title) continue;
      try {
        const values = await sheets.spreadsheets.values.get({ spreadsheetId, range: title });
        console.log(`\n--- ${title} ---`);
        console.log(values.data.values?.[0] ?? "(empty)");
      } catch (e) {
        console.log(`\n--- ${title} --- ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

main();
