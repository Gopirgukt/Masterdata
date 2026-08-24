-- Every company has two sheets: the "Internal Sheet" (companies.sheet_id —
-- what we sync candidates from) and a separate "Company Sheet" — a smaller,
-- client-facing profile list shared with the hiring company. Recruiters
-- sometimes forget to flip "Shared with the company" to Yes in the Internal
-- Sheet even after a candidate's profile has actually gone out — this column
-- lets a reconciliation job cross-check the two and catch that.

alter table companies add column if not exists company_sheet_url text;
alter table companies add column if not exists company_sheet_id text;

comment on column companies.company_sheet_id is 'Spreadsheet ID of the client-facing "Company Sheet Link" (from the Main tab), distinct from the Internal Sheet in sheet_id. Used to reconcile shared_to_company against who was actually shared.';
