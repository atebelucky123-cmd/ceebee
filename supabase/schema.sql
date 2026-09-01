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
-- Separate from "done": Clear Schedule greys out/locks whatever is still
-- undone for the day without marking it complete. Unclear Schedule reverses
-- just that -- individually-ticked "done" events are never touched by
-- either action.
alter table schedule_events add column if not exists cleared boolean not null default false;

-- Recurrence: "everyday"/"weekdays"/"weekends"/"custom" schedule items.
-- Recurring events are materialized as individual rows (one per matching
-- date, generated up front) sharing a series_id, rather than expanding a
-- rule at read time -- this keeps every existing "events on date X" query
-- unchanged and makes deleting/editing a single occurrence trivial.
alter table schedule_events add column if not exists recurrence text not null default 'none';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schedule_events_recurrence_check'
  ) then
    alter table schedule_events add constraint schedule_events_recurrence_check
      check (recurrence in ('none','daily','weekdays','weekends','custom'));
  end if;
end $$;
alter table schedule_events add column if not exists recurrence_days smallint[];
alter table schedule_events add column if not exists series_id uuid;
create index if not exists schedule_events_series_idx on schedule_events (series_id);

-- Memories: durable facts CeeBee learns about Shina over time, injected
-- into her instructions on every chat request. This is the "training"
-- layer -- not model fine-tuning, just a growing personal context file.
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  fact text not null,
  created_at timestamptz not null default now()
);
alter table memories enable row level security;
-- Safe to re-run: category/importance let CeeBee inject only relevant
-- memories per request instead of the entire table every time.
alter table memories add column if not exists category text default 'general';
alter table memories add column if not exists importance smallint default 3;

-- Usage logs: one row per Gemini API call, for the developer tools token
-- usage dashboard (requests/message ratio, token counts over time).
create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  prompt_tokens integer,
  output_tokens integer,
  thought_tokens integer,
  cached_tokens integer,
  total_tokens integer,
  tool_calls integer default 0,
  latency_ms integer,
  created_at timestamptz not null default now()
);
alter table usage_logs enable row level security;

-- Rate limit tracking: a row per Gemini request in the last minute, used to
-- self-enforce a safety margin below Gemini's free-tier RPM cap.
create table if not exists rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table rate_limit_hits enable row level security;
create index if not exists rate_limit_hits_created_idx on rate_limit_hits (created_at);

-- Web Push subscriptions, for real push notifications (reminders/tasks).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription jsonb not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;

-- Chat history: persisted conversations so the retractable sidebar can list
-- and search past chats instead of losing them on refresh.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table conversations enable row level security;

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table chat_messages enable row level security;
create index if not exists chat_messages_conversation_idx on chat_messages (conversation_id);

-- App settings: currently just holds which LLM model CeeBee should use.
-- Single row, always id = 1.
create table if not exists app_settings (
  id smallint primary key default 1,
  model text not null default 'openai/gpt-oss-120b',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
alter table app_settings enable row level security;
insert into app_settings (id, model) values (1, 'openai/gpt-oss-120b')
  on conflict (id) do nothing;
-- Migrates anyone who already had the now-unavailable llama-3.1-8b-instant
-- or gemini-2.5-flash saved as their model.
update app_settings set model = 'openai/gpt-oss-120b'
  where model in ('llama-3.1-8b-instant', 'gemini-2.5-flash');

-- Track rate-limit hits per provider, since Gemini and Groq have separate,
-- very different quotas (Gemini free tier is far stricter).
alter table rate_limit_hits add column if not exists provider text default 'gemini';
