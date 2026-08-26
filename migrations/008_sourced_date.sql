-- "Date of Sourcing" (when a candidate was assigned/picked up by a recruiter)
-- is a distinct date from "Call Date" (when they were actually called) that
-- every company's sheet tracks but the sync never captured. Needed for the
-- Recruiter Pipeline's per-company "Assigned today" count.

alter table candidates add column if not exists sourced_date date;

comment on column candidates.sourced_date is 'Parsed from the sheet''s "Date of Sourcing" column — when the candidate was assigned to a recruiter, distinct from call_date (when they were actually called).';
