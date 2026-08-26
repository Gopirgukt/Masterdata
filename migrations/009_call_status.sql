-- "Call Status" (e.g. "Call Done", "Not Answering", "Switched Off", "Call
-- Back") is its own column in every company's sheet, distinct from
-- call_date/call_done_by. Needed to tell "assigned to be called that day"
-- (call_date present) apart from "actually attempted" (call_status filled in)
-- on the Recruiter Pipeline's per-company daily breakdown.

alter table candidates add column if not exists call_status text;

comment on column candidates.call_status is 'Parsed from the sheet''s "Call Status" column (e.g. "Call Done", "Not Answering", "Switched Off"). Blank means the call hasn''t actually been attempted yet, even if call_date is set.';
