-- Run this in your Supabase project's SQL Editor (Supabase Dashboard ->
-- SQL Editor -> New query) before using CeeBee for the first time.

create table if not exists google_accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  label text not null default 'default',
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: locked down since only the backend (using the
-- service role key) should ever read/write this table directly.
alter table google_accounts enable row level security;

-- Tasks: simple checkbox to-do items, separate from calendar events.
-- Powers the "Tasks" section and the productivity stats view.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table tasks enable row level security;

-- Notes: freeform text, no due date or checkbox state.
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table notes enable row level security;

-- Schedule events: the "Schedule" section under Today. Distinct from Google
-- Calendar events -- these are lighter-weight, with priority + reminder
-- settings, and don't require a Google account to use.
create table if not exists schedule_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  meeting_link text,
  priority smallint not null default 3 check (priority between 1 and 5),
  remind_before_minutes smallint, -- null = "don't remind"; 5, 10, 30, or 60
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
alter table schedule_events enable row level security;
create index if not exists schedule_events_date_idx on schedule_events (event_date);

