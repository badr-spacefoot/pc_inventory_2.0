create table if not exists public.collection_invites (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_collection_invites_code on public.collection_invites(invite_code);
create index if not exists idx_collection_invites_expiry on public.collection_invites(expires_at desc);

alter table public.collection_invites enable row level security;
