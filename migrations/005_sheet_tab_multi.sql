-- No schema change — sheet_tab already accepts any text. This just documents
-- that it now holds a comma-separated list, since some companies (confirmed:
-- Kanerika, Tofler) run multiple open roles as separate tabs in the same
-- spreadsheet, and the sync job needs to read all of them.

comment on column companies.sheet_tab is 'Comma-separated list of worksheet/tab names inside sheet_id holding this company''s candidate rows (e.g. "JD_1,JD2 (Fullstack)"). A company may run several open roles as separate tabs.';
