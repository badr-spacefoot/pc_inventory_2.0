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

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_status_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_status_check
  check (enrichment_status in ('pending', 'partial', 'completed', 'failed'));

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_price_confidence_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_price_confidence_check
  check (price_confidence_score between 0 and 100);

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_replacement_priority_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_replacement_priority_check
  check (replacement_priority between 0 and 100);

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

create index if not exists idx_hardware_enrichment_priority on public.hardware_enrichment(replacement_priority desc);
create index if not exists idx_cpu_benchmarks_normalized_name on public.cpu_benchmarks(normalized_name);

alter table public.cpu_benchmarks enable row level security;

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
