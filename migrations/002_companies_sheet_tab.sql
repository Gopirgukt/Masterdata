-- Each company's candidate data lives in a differently-named tab within its
-- own spreadsheet (confirmed varies per company), so the sync job needs to
-- know which tab to read per company.

alter table companies add column if not exists sheet_tab text;

comment on column companies.sheet_tab is 'Name of the worksheet/tab inside sheet_id that holds this company''s candidate rows (e.g. "JD_1"). Varies per company.';
