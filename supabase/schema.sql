create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text not null default '#16735f',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  establishment_type text not null default 'office'
    check (establishment_type in ('warehouse', 'store', 'headquarters', 'research', 'accounting', 'office', 'other')),
  address text,
  postal_code text,
  city text,
  country text not null default 'France',
  latitude numeric,
  longitude numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.teams add column if not exists description text;
alter table public.teams add column if not exists color text not null default '#16735f';
alter table public.teams add column if not exists active boolean not null default true;
alter table public.establishments add column if not exists address text;
alter table public.establishments add column if not exists establishment_type text not null default 'office';
alter table public.establishments add column if not exists postal_code text;
alter table public.establishments add column if not exists city text;
alter table public.establishments add column if not exists country text not null default 'France';
alter table public.establishments add column if not exists latitude numeric;
alter table public.establishments add column if not exists longitude numeric;
alter table public.establishments add column if not exists active boolean not null default true;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  team_id uuid references public.teams(id),
  establishment_id uuid references public.establishments(id),
  service text not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  assigned_user_id uuid references public.users(id),
  team_id uuid references public.teams(id),
  establishment_id uuid references public.establishments(id),
  hostname text not null,
  os_name text,
  os_version text,
  manufacturer text,
  model text,
  serial_number text,
  cpu text,
  gpu text,
  ram_total_gb numeric,
  storage_total_gb numeric,
  storage_free_gb numeric,
  storage_type text,
  mac_address text,
  local_ip text,
  windows_user text,
  script_version text,
  last_seen_at timestamptz,
  hardware_age_score integer not null default 0 check (hardware_age_score between 0 and 100),
  status text not null default 'active' check (status in ('active', 'replace', 'stock', 'lost', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_scans (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid references public.users(id),
  collected_at timestamptz not null default now(),
  hostname text,
  os_name text,
  os_version text,
  manufacturer text,
  model text,
  serial_number text,
  cpu text,
  gpu text,
  ram_total_gb numeric,
  storage_total_gb numeric,
  storage_free_gb numeric,
  storage_type text,
  mac_address text,
  local_ip text,
  windows_user text,
  script_version text,
  hardware_age_score integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_access_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  token_prefix text not null,
  expires_at timestamptz not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hardware_enrichment (
  device_id uuid primary key references public.devices(id) on delete cascade,
  cpu_name text,
  cpu_score integer,
  cpu_generation text,
  cpu_release_year integer,
  model_release_year integer,
  estimated_launch_price numeric,
  current_new_price numeric,
  current_market_price_min numeric,
  current_market_price_avg numeric,
  current_market_price_max numeric,
  market_source text,
  performance_index integer,
  obsolescence_index integer,
  recommendation text check (recommendation in ('keep', 'watch', 'replace')),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  last_enriched_at timestamptz not null default now(),
  raw_data jsonb not null default '{}'::jsonb
);

alter table public.devices add column if not exists gpu text;
alter table public.devices add column if not exists storage_type text;
alter table public.device_scans add column if not exists gpu text;
alter table public.device_scans add column if not exists storage_type text;
alter table public.hardware_enrichment add column if not exists release_year integer;
alter table public.hardware_enrichment add column if not exists estimated_current_value numeric;
alter table public.hardware_enrichment add column if not exists price_confidence_score integer not null default 0;
alter table public.hardware_enrichment add column if not exists cpu_benchmark_score integer;
alter table public.hardware_enrichment add column if not exists enrichment_status text not null default 'pending';
alter table public.hardware_enrichment add column if not exists enrichment_source text;
alter table public.hardware_enrichment add column if not exists replacement_priority integer not null default 0;
alter table public.hardware_enrichment add column if not exists device_category text;
alter table public.hardware_enrichment add column if not exists notes text;

create table if not exists public.cpu_benchmarks (
  id uuid primary key default gen_random_uuid(),
  cpu_name text not null,
  normalized_name text not null unique,
  cpu_mark_score integer not null check (cpu_mark_score > 0),
  release_year integer,
  generation text,
  category text,
  source text not null default 'manual-import',
  updated_at timestamptz not null default now()
);

create table if not exists public.market_price_history (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  source text not null,
  search_query text not null,
  price numeric,
  currency text not null default 'EUR',
  condition text,
  listing_url text,
  collected_at timestamptz not null default now()
);

create index if not exists idx_devices_last_seen_at on public.devices(last_seen_at desc);
create index if not exists idx_devices_status on public.devices(status);
create index if not exists idx_devices_serial_number on public.devices(serial_number);
create index if not exists idx_devices_hostname_mac on public.devices(hostname, mac_address);
create index if not exists idx_device_scans_device_collected on public.device_scans(device_id, collected_at desc);
create index if not exists idx_collection_tokens_hash on public.collection_tokens(token_hash);
create index if not exists idx_collection_access_tokens_hash on public.collection_access_tokens(token_hash);
create index if not exists idx_collection_access_tokens_expiry on public.collection_access_tokens(expires_at desc);
create index if not exists idx_hardware_enrichment_recommendation on public.hardware_enrichment(recommendation);
create index if not exists idx_hardware_enrichment_cpu_score on public.hardware_enrichment(cpu_score);
create index if not exists idx_hardware_enrichment_priority on public.hardware_enrichment(replacement_priority desc);
create index if not exists idx_cpu_benchmarks_normalized_name on public.cpu_benchmarks(normalized_name);
create index if not exists idx_market_price_history_device_collected on public.market_price_history(device_id, collected_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.consume_collection_access_token(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  consumed_id uuid;
begin
  update public.collection_access_tokens
  set
    use_count = use_count + 1,
    last_used_at = now()
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
    and (max_uses is null or use_count < max_uses)
  returning id into consumed_id;

  return consumed_id;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create or replace view public.device_inventory_view as
select
  d.id,
  d.dedupe_key,
  d.hostname,
  d.os_name,
  d.os_version,
  d.manufacturer,
  d.model,
  d.serial_number,
  d.cpu,
  d.ram_total_gb,
  d.storage_total_gb,
  d.storage_free_gb,
  d.mac_address,
  d.local_ip,
  d.windows_user,
  d.script_version,
  d.last_seen_at,
  d.hardware_age_score,
  d.status,
  d.created_at,
  d.updated_at,
  he.cpu_name as enrichment_cpu_name,
  he.cpu_score,
  he.cpu_generation,
  he.cpu_release_year,
  he.model_release_year,
  he.estimated_launch_price,
  he.current_new_price,
  he.current_market_price_min,
  he.current_market_price_avg,
  he.current_market_price_max,
  he.market_source,
  he.performance_index,
  he.obsolescence_index,
  he.recommendation,
  he.confidence_score,
  he.last_enriched_at,
  u.first_name,
  u.last_name,
  u.email,
  u.service,
  u.comment,
  t.name as team_name,
  e.name as establishment_name,
  d.gpu,
  d.storage_type,
  he.release_year,
  he.estimated_current_value,
  he.price_confidence_score,
  he.cpu_benchmark_score,
  he.enrichment_status,
  he.enrichment_source,
  he.replacement_priority,
  he.device_category,
  he.notes as enrichment_notes
from public.devices d
left join public.users u on u.id = d.assigned_user_id
left join public.teams t on t.id = d.team_id
left join public.establishments e on e.id = d.establishment_id
left join public.hardware_enrichment he on he.device_id = d.id;

alter table public.teams enable row level security;
alter table public.establishments enable row level security;
alter table public.users enable row level security;
alter table public.devices enable row level security;
alter table public.device_scans enable row level security;
alter table public.collection_tokens enable row level security;
alter table public.collection_access_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.hardware_enrichment enable row level security;
alter table public.market_price_history enable row level security;
alter table public.cpu_benchmarks enable row level security;

-- Les lectures/ecritures applicatives passent par la Edge Function avec la service role key.
-- Aucune policy publique n'est creee afin d'eviter l'exposition depuis GitHub Pages.
