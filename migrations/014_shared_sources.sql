-- "Shared with the company" has two sources that disagree in practice:
-- recruiters often forget to flip the internal sheet's column to "Yes" even
-- though the profile is already in the client-facing Company Sheet
-- (confirmed with the user 2026-10-08). Keep each source separately so the
-- dashboard can show the gap, while shared_to_company stays the combined
-- answer (either source says shared).

alter table candidates add column if not exists shared_in_internal_sheet boolean;
alter table candidates add column if not exists in_company_sheet boolean not null default false;

comment on column candidates.shared_in_internal_sheet is 'Raw "Shared with the company" value from the internal recruiting sheet (Yes = true), as of the last sync.';
comment on column candidates.in_company_sheet is 'Candidate''s name appears in the company''s client-facing Company Sheet (set by lib/sync/syncCompanySheets.ts).';
comment on column candidates.shared_to_company is 'Combined: shared per the internal sheet OR found in the Company Sheet. Never downgraded by the hourly sync.';

-- Starting point until the next syncs fill these in: treat today's flag as
-- the internal sheet's value. The hourly sync corrects any row where the
-- internal sheet actually says otherwise (only a handful — rows the Company
-- Sheet sync had already flipped), and the Company Sheet sync sets
-- in_company_sheet.
update candidates
set shared_in_internal_sheet = coalesce(shared_to_company, false)
where shared_in_internal_sheet is null;
