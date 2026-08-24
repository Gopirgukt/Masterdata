-- The dashboard has no login screen — it reads with the anon/publishable key
-- directly from the browser. RLS was blocking those reads (returning empty
-- results with no error, which is why the UI looked "connected but empty").
--
-- This makes companies/candidates world-readable to anyone holding the anon
-- key (which ships in the frontend bundle). Writes stay locked down — only
-- the service_role key (used by the sync job, never exposed to the browser)
-- can bypass RLS to insert/update. Revisit this if the dashboard is ever
-- deployed somewhere publicly reachable without an auth wall in front of it.

alter table companies enable row level security;
alter table candidates enable row level security;

create policy "Public read access" on companies for select using (true);
create policy "Public read access" on candidates for select using (true);
