-- ============================================================
-- VILLATASK — Supabase Schema
-- ============================================================
-- Jalankan SQL ini di Supabase SQL Editor setelah membuat project
-- ============================================================

-- Enable Row Level Security (RLS) is optional for anon key access
-- but recommended for production. For simplicity, we allow anon access.

create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text default '',
  location text default '',
  priority text default 'menengah',
  status text default 'belum',
  assigned_to text default '',
  photos text default '[]',
  completion_note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.devices (
  id bigserial primary key,
  token text unique not null,
  helper_name text default '',
  role text default '',
  created_at timestamptz default now()
);

-- Enable real-time for instant sync
alter publication supabase_realtime add table public.tasks;

-- Allow anon access (for client-side API calls)
create policy "Allow anon select tasks"
  on public.tasks for select
  using (true);

create policy "Allow anon insert tasks"
  on public.tasks for insert
  with check (true);

create policy "Allow anon update tasks"
  on public.tasks for update
  using (true)
  with check (true);

create policy "Allow anon delete tasks"
  on public.tasks for delete
  using (true);

create policy "Allow anon select devices"
  on public.devices for select
  using (true);

create policy "Allow anon insert devices"
  on public.devices for insert
  with check (true);

create policy "Allow anon update devices"
  on public.devices for update
  using (true)
  with check (true);
