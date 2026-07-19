-- Run this in the Harrows Install EOD Supabase project's SQL editor
-- Core tables for the End of Day install reporting tool

create table if not exists installers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  pin text not null unique,
  role text not null default 'installer' check (role in ('installer', 'team_leader')),
  admin_access boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists job_cards (
  id uuid primary key default gen_random_uuid(),
  job_number text not null,
  project_name text not null,
  address text,
  created_at timestamptz not null default now(),
  created_by text
);

create table if not exists eod_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references job_cards(id) on delete set null,
  installer_id uuid references installers(id) on delete set null,
  report_date date not null,
  percent_complete integer not null default 0 check (percent_complete between 0 and 100),
  work_done text not null,
  work_scheduled_tomorrow text,
  products text,
  issues text,
  solutions text,
  additional_notes text,
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists eod_report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references eod_reports(id) on delete cascade not null,
  blob_pathname text not null,
  created_at timestamptz not null default now()
);

create table if not exists eod_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists eod_signin_log (
  id bigserial primary key,
  installer_id uuid references installers(id) on delete set null,
  installer_name text not null,
  signed_in_at timestamptz not null default now()
);

create index if not exists job_cards_search on job_cards (job_number, project_name);
create index if not exists eod_reports_job_date on eod_reports (job_id, report_date desc);
create index if not exists eod_report_photos_report on eod_report_photos (report_id);
create index if not exists eod_signin_log_time on eod_signin_log (signed_in_at desc);
