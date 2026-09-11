-- Only tech_remarks (Tech Team's written feedback) was ever captured — Call
-- Remarks and the Technical Recruiter's own "Other Remarks" text were mapped
-- nowhere, so a candidate's feedback view was missing two-thirds of what
-- recruiters actually write. See lib/sync/mapping.ts and
-- components/CandidateFeedbackModal.tsx.
alter table candidates add column if not exists call_remarks text;
alter table candidates add column if not exists tr_remarks text;
