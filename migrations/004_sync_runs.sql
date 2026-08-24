-- Logs every sync run (one row per execution of /api/sync or scripts/sync.ts)
-- so the dashboard can show "last updated" and so failures are visible
-- somewhere other than a Vercel log stream.

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  companies_synced int not null default 0,
  total_inserted int not null default 0,
  total_updated int not null default 0,
  total_errors int not null default 0,
  error_details text
);

alter table sync_runs enable row level security;

-- Same public-read stance as companies/candidates (see migrations/003) — no
-- login screen yet, dashboard reads with the anon key. Only service_role
-- (the sync job) ever writes here.
create policy "Public read access" on sync_runs for select using (true);
