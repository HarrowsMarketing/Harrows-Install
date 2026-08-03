-- Run this in the Harrows Install EOD Supabase project's SQL editor
-- Adds an internal-only notes field on reports, and flags photos as internal-only —
-- these back the "Internal Report" PDF variant, which is never shown to the client.

alter table eod_reports add column if not exists internal_notes text;
alter table eod_report_photos add column if not exists is_internal boolean not null default false;
