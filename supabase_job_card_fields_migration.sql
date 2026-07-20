-- Run this in the Harrows Install EOD Supabase project's SQL editor
-- Adds billing/project manager/salesperson detail fields to job_cards

alter table job_cards add column if not exists billing_company text;
alter table job_cards add column if not exists invoice_to text;
alter table job_cards add column if not exists invoice_phone text;
alter table job_cards add column if not exists invoice_email text;
alter table job_cards add column if not exists pm_name text;
alter table job_cards add column if not exists pm_phone text;
alter table job_cards add column if not exists pm_email text;
alter table job_cards add column if not exists salesperson_name text;
alter table job_cards add column if not exists salesperson_email text;
