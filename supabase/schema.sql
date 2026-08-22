-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  table_id text not null check (table_id in ('wit', 'zwart')),
  slot text not null,               -- e.g. '20:00'
  name text not null,
  owner_token text not null,        -- identifies the browser/device that booked it
  competition text,                 -- 'mij' | 'nidm' | 'kbbb'
  created_at timestamptz not null default now(),
  unique (date, table_id, slot)
);

-- Enable Row Level Security, then allow public read/insert/delete.
-- This keeps things simple for a small café tool: anyone with the site
-- link can view, book and cancel. There is no login system. If you ever
-- want to restrict who can cancel a booking beyond the app's own UI
-- check, that requires adding real authentication (e.g. Supabase Auth)
-- and tightening these policies -- ask me if you'd like that later.
alter table reservations enable row level security;

create policy "Public read" on reservations
  for select using (true);

create policy "Public insert" on reservations
  for insert with check (true);

create policy "Public delete" on reservations
  for delete using (true);

-- Optional but recommended: enable Realtime for this table so all open
-- browsers update live when someone books or cancels.
-- In the Supabase dashboard: Database -> Replication -> toggle "reservations" on.
