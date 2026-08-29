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
