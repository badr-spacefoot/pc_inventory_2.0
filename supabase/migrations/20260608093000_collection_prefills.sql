create table if not exists public.collection_prefills (
  id uuid primary key default gen_random_uuid(),
  prefill_code text not null unique,
  collection_access_token text not null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_collection_prefills_code on public.collection_prefills(prefill_code);
create index if not exists idx_collection_prefills_expiry on public.collection_prefills(expires_at desc);
