-- Tracks per-company sync health so access problems (a sheet not shared with
-- the service account, a renamed tab, etc.) show up in the dashboard instead
-- of only in a terminal error dump — sync keeps going for every other
-- company regardless of one being blocked.

alter table companies add column if not exists sync_status text not null default 'ok';
alter table companies add column if not exists sync_error text;

comment on column companies.sync_status is 'ok | error — set by the sync job after each attempt on this company.';
comment on column companies.sync_error is 'Human-readable reason the last sync attempt failed (e.g. "Access denied — sheet not shared with the sync service account"). Null when sync_status is ok.';
