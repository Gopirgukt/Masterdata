-- Later-stage pipeline tracking (confirmed 2026-08-26: present in several
-- companies' sheets as "Screening Status", "TR 1 Status", "TR 2 Status",
-- "HR/MR Status", "Hired Status" — a funnel beyond the existing tr_status/
-- tech_status columns, used for candidates who progress past tech screening
-- into a company's own multi-round interview process).

alter table candidates add column if not exists screening_status text;
alter table candidates add column if not exists tr1_status text;
alter table candidates add column if not exists tr2_status text;
alter table candidates add column if not exists hr_mr_status text;
alter table candidates add column if not exists hired_status text;

comment on column candidates.screening_status is 'Sheet''s "Screening Status" column — distinct from tr_status (Internal Screening Status Technical Recruiter).';
comment on column candidates.tr1_status is 'Sheet''s "TR 1 Status" column.';
comment on column candidates.tr2_status is 'Sheet''s "TR 2 Status" column.';
comment on column candidates.hr_mr_status is 'Sheet''s "HR/MR Status" column.';
comment on column candidates.hired_status is 'Sheet''s "Hired Status" column — literally "Hired" or blank.';
