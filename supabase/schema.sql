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
  start_time time,
  end_time time,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table tasks enable row level security;
-- Safe to re-run: adds the new time columns if this table already existed
-- from an earlier version.
alter table tasks add column if not exists start_time time;
alter table tasks add column if not exists end_time time;

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
  end_time time,
  meeting_link text,
  priority smallint not null default 3 check (priority between 1 and 5),
  remind_before_minutes smallint, -- null = "don't remind"; 5, 10, 30, or 60
  notified boolean not null default false,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table schedule_events enable row level security;
create index if not exists schedule_events_date_idx on schedule_events (event_date);
-- Safe to re-run: adds the new columns if this table already existed from
-- an earlier version. Nothing is deleted -- completed/past events stay in
-- this table permanently, so it doubles as your schedule history.
alter table schedule_events add column if not exists end_time time;
alter table schedule_events add column if not exists done boolean not null default false;

-- Memories: durable facts CeeBee learns about Shina over time, injected
-- into her instructions on every chat request. This is the "training"
-- layer -- not model fine-tuning, just a growing personal context file.
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  fact text not null,
  created_at timestamptz not null default now()
);
alter table memories enable row level security;


