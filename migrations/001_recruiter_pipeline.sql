-- Adds the columns the Recruiter Pipeline view (/dashboard/pipeline) needs.
-- Everything else in the dashboard reads the existing schema unchanged.
--
-- Funnel-stage mapping used by the dashboard once these columns exist:
--   Recruiter  -> recruiter
--   Calls      -> count(*) where call_date is not null
--   Interested -> count(*) where interested = true
--   Scheduled  -> count(*) where tech_screening_date is not null
--   Shared     -> count(*) where shared_to_company = true   (existing column, no change)
--   Offer      -> count(*) where company_decision ilike '%offer%'
--
-- Run this in the Supabase SQL editor (or via the CLI) before loading
-- /dashboard/pipeline — every other page works without it.

alter table candidates add column if not exists recruiter text;
alter table candidates add column if not exists interested boolean not null default false;

comment on column candidates.recruiter is 'Recruiter who owns this candidate through the funnel (distinct from call_done_by / tech_screening_taken_by).';
comment on column candidates.interested is 'Candidate expressed interest after the initial call — feeds the Recruiter Pipeline "Interested" stage.';
