-- Mirrors the "Main" tab of the org-wide master sheet (the same spreadsheet
-- discoverCompanies.ts already reads "Tech interactions" from) — one row per
-- open role/JD ever requested, across every company, including ones that
-- never became a registered `companies` row. Read-only mirror: each sync
-- fully replaces the table's contents (see lib/sync/syncJobOpenings.ts), so
-- there's no per-row identity to preserve across syncs.
create table if not exists job_openings (
  id uuid primary key default gen_random_uuid(),
  crm_owner text,
  jd_no text,
  requested_date date,
  company_name text not null,
  website text,
  role text,
  years_of_experience text,
  ctc text,
  openings integer,
  poc_name text,
  poc_mobile text,
  poc_email text,
  technical_recruiter text,
  status text,
  is_active text,
  synced_at timestamptz not null default now()
);

create index if not exists job_openings_requested_date_idx on job_openings (requested_date);
create index if not exists job_openings_company_name_idx on job_openings (company_name);

alter table job_openings enable row level security;
create policy "Public read access" on job_openings for select using (true);
