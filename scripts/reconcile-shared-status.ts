/**
 * Cross-checks each company's "Company Sheet" (the client-facing profile list
 * actually shared with the hiring company) against our candidates.shared_to_company.
 *
 * The Internal Sheet's "Shared with the company" column is filled in by hand and
 * sometimes forgotten even after a profile has genuinely gone out — but if a
 * candidate's name appears in the Company Sheet at all, that's real proof they
 * were shared, regardless of what the Internal Sheet says. This corrects
 * shared_to_company to true wherever that mismatch is found.
 *
 * Matches by name only (case-insensitive, trimmed), scoped to one company at a
 * time — Company Sheet tabs vary in structure and don't reliably carry phone
 * numbers, so name is the only common field across all of them.
 *
 * Usage:
 *   npx tsx scripts/reconcile-shared-status.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSheetsClient } from "@/lib/sync/googleSheetsClient";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Same quota-retry pattern as lib/sync/googleSheetsClient.ts — checking every
 * company's Company Sheet (several tabs each) trips Google's per-minute read
 * quota just as easily as the main sync/onboarding did. */
async function withQuotaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("quota exceeded")) {
      await sleep(20000);
      return await fn();
    }
    throw err;
  }
}

async function getSharedNames(sheets: ReturnType<typeof getSheetsClient>, spreadsheetId: string): Promise<Set<string>> {
  const meta = await withQuotaRetry(() => sheets.spreadsheets.get({ spreadsheetId }));
  const names = new Set<string>();

  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (!title) continue;

    const headerRow = await withQuotaRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `${title}!1:1` }));
    const headers = (headerRow.data.values?.[0] ?? []).map((h) => (h ?? "").trim().toLowerCase());
    const nameIdx = headers.indexOf("name");
    if (nameIdx < 0) {
      await sleep(150);
      continue;
    }

    const values = await withQuotaRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: title }));
    const rows = values.data.values ?? [];
    for (const row of rows.slice(1)) {
      const name = (row[nameIdx] ?? "").trim();
      if (name) names.add(normalizeName(name));
    }
    await sleep(150);
  }

  return names;
}

async function main() {
  const sheets = getSheetsClient();
  const supabase = createAdminClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, company_sheet_id")
    .not("company_sheet_id", "is", null);

  let totalCorrected = 0;
  let companiesWithCorrections = 0;
  let accessIssues = 0;

  for (const company of companies ?? []) {
    let sharedNames: Set<string>;
    try {
      sharedNames = await getSharedNames(sheets, company.company_sheet_id!);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[SKIP] ${company.name} — could not read Company Sheet: ${message}`);
      accessIssues++;
      continue;
    }

    if (sharedNames.size === 0) {
      continue;
    }

    const { data: candidates } = await supabase
      .from("candidates")
      .select("id, name")
      .eq("company_id", company.id)
      .eq("shared_to_company", false);

    const toCorrect = (candidates ?? []).filter((c) => c.name && sharedNames.has(normalizeName(c.name)));
    if (toCorrect.length === 0) continue;

    for (const candidate of toCorrect) {
      await supabase.from("candidates").update({ shared_to_company: true }).eq("id", candidate.id);
    }

    console.log(`[CORRECTED] ${company.name} — ${toCorrect.length} candidate(s): ${toCorrect.map((c) => c.name).join(", ")}`);
    totalCorrected += toCorrect.length;
    companiesWithCorrections++;
  }

  console.log(
    `\nDone. ${totalCorrected} candidates corrected to shared=true across ${companiesWithCorrections} companies. ${accessIssues} Company Sheets unreadable (not shared with the service account, or link is broken).`,
  );
}

main();
