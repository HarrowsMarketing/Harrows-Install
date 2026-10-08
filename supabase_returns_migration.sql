-- Run this in the Harrows Install EOD Supabase project's SQL editor
-- Returns tab: furniture coming back to the Timaru factory (freight/site damage,
-- manufacturing issues, wrong items, warranty, loan gear).

create sequence if not exists returns_number_seq;

create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique default ('RTN-' || lpad(nextval('returns_number_seq')::text, 4, '0')),

  -- Section A: job information
  job_id uuid references job_cards(id) on delete set null,
  original_job_number text not null,
  original_job_name text not null,
  site_address text,
  new_so_number text,
  required_by date,
  priority text not null default 'normal' check (priority in ('urgent', 'high', 'normal')),

  -- Section B: reason
  reason text not null check (reason in ('Freight damage', 'Site damage', 'Manufacturing issue', 'Incorrect item', 'Warranty', 'Loan gear', 'Other')),
  issue_description text,
  photos_attached boolean,

  -- Section C: items (up to 3 of {description, quantity, action})
  items jsonb not null default '[]'::jsonb,

  -- Section D: freight return
  requested_by text,
  freight_company text,
  freight_docket text,
  pickup_location text,
  expected_pickup_date date,
  estimated_arrival_date date,

  -- Section E: factory receiving
  received_by text,
  date_received date,
  factory_location text,
  arrival_damage text,
  responsible_person text,

  -- Status: derived from the fields above unless manually overridden
  status text not null default 'logged' check (status in ('logged', 'freight_booked', 'in_transit', 'received', 'completed')),
  status_manual boolean not null default false,

  -- Section F: complete
  completed_at timestamptz,
  completed_by text,

  -- overdue email bookkeeping: the estimated_arrival_date the last overdue email was sent for
  overdue_notified_for date,

  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now()
);

create table if not exists return_photos (
  id uuid primary key default gen_random_uuid(),
  return_id uuid references returns(id) on delete cascade not null,
  blob_pathname text not null,
  kind text not null default 'site' check (kind in ('site', 'factory')),
  created_at timestamptz not null default now()
);

create table if not exists return_activity (
  id bigserial primary key,
  return_id uuid references returns(id) on delete cascade not null,
  actor text,
  action text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);

create index if not exists returns_job on returns (job_id);
create index if not exists returns_open on returns (completed_at, estimated_arrival_date);
create index if not exists return_photos_return on return_photos (return_id, created_at);
create index if not exists return_activity_return on return_activity (return_id, created_at desc);
