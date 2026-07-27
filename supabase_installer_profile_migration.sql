-- Run this in the Harrows Install EOD Supabase project's SQL editor
-- Adds installer self-service profile photo support

alter table installers add column if not exists photo_pathname text;
