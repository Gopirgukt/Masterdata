-- Tracks tabs found in a company's spreadsheet that look like real candidate
-- tracking tabs (Name + Mobile Number + Status headers, with recent activity)
-- but aren't in that company's sheet_tab list yet — e.g. a company opens a new
-- role and adds a new tab, which the sync job has no way to know about on its
-- own. Comma-separated tab names, cleared automatically once the tab is added
-- to sheet_tab or activity on it goes stale. See lib/sync/rescanTabs.ts.
alter table companies add column if not exists new_tabs_detected text;
