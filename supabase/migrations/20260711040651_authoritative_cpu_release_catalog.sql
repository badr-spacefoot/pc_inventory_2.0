create table if not exists public.cpu_release_catalog (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (vendor in ('intel', 'amd', 'apple', 'qualcomm')),
  canonical_name text not null,
  normalized_name text not null,
  part_number text,
  family text,
  series text,
  announcement_date date,
  availability_period_start date,
  availability_period_end date,
  effective_period_start date,
  effective_period_end date,
  release_precision text not null default 'unknown'
    check (release_precision in ('day', 'month', 'quarter', 'half_year', 'year', 'unknown')),
  release_event_type text not null default 'unknown'
    check (release_event_type in ('announcement', 'launch', 'first_product_availability', 'expected_availability', 'unknown')),
  release_display text,
  raw_release_value text,
  source_type text not null,
  source_url text not null,
  source_title text,
  source_published_at timestamptz,
  source_evidence jsonb not null default '[]'::jsonb,
  is_official boolean not null default true,
  match_scope text not null default 'exact_name'
    check (match_scope in ('part_number', 'exact_name', 'alias', 'family')),
  content_hash text,
  etag text,
  last_modified text,
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_period_end is null or effective_period_start is null or effective_period_end >= effective_period_start),
  check (availability_period_end is null or availability_period_start is null or availability_period_end >= availability_period_start)
);

create unique index if not exists uq_cpu_release_catalog_vendor_name
  on public.cpu_release_catalog(vendor, normalized_name);
create unique index if not exists uq_cpu_release_catalog_vendor_part
  on public.cpu_release_catalog(vendor, lower(part_number))
  where part_number is not null and btrim(part_number) <> '';
create index if not exists idx_cpu_release_catalog_verified
  on public.cpu_release_catalog(last_verified_at);
create index if not exists idx_cpu_release_catalog_precision
  on public.cpu_release_catalog(release_precision);
create index if not exists idx_cpu_release_catalog_vendor_family
  on public.cpu_release_catalog(vendor, family);

create table if not exists public.cpu_release_aliases (
  id uuid primary key default gen_random_uuid(),
  cpu_release_id uuid not null references public.cpu_release_catalog(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  alias_type text not null default 'collector'
    check (alias_type in ('collector', 'manufacturer', 'benchmark', 'part_number', 'manual')),
  created_at timestamptz not null default now(),
  unique (cpu_release_id, normalized_alias)
);

create index if not exists idx_cpu_release_aliases_normalized
  on public.cpu_release_aliases(normalized_alias);

create table if not exists public.cpu_release_sync_runs (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (vendor in ('intel', 'amd', 'apple', 'qualcomm', 'all')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  discovered_count integer not null default 0 check (discovered_count >= 0),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  unresolved_count integer not null default 0 check (unresolved_count >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_error text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_cpu_release_sync_runs_vendor_started
  on public.cpu_release_sync_runs(vendor, started_at desc);

alter table public.hardware_enrichment
  add column if not exists cpu_release_catalog_id uuid references public.cpu_release_catalog(id) on delete set null;
alter table public.hardware_enrichment add column if not exists cpu_release_period_start date;
alter table public.hardware_enrichment add column if not exists cpu_release_period_end date;
alter table public.hardware_enrichment add column if not exists cpu_release_precision text;
alter table public.hardware_enrichment add column if not exists cpu_release_event_type text;
alter table public.hardware_enrichment add column if not exists cpu_release_display text;
alter table public.hardware_enrichment add column if not exists cpu_release_source_type text;
alter table public.hardware_enrichment add column if not exists cpu_release_source_url text;
alter table public.hardware_enrichment add column if not exists cpu_release_match_scope text;
alter table public.hardware_enrichment add column if not exists cpu_release_match_method text;
alter table public.hardware_enrichment add column if not exists cpu_release_confidence integer;
alter table public.hardware_enrichment add column if not exists cpu_release_is_official boolean;
alter table public.hardware_enrichment add column if not exists cpu_release_last_verified_at timestamptz;

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_cpu_release_precision_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_cpu_release_precision_check
  check (cpu_release_precision is null or cpu_release_precision in ('day', 'month', 'quarter', 'half_year', 'year', 'unknown'));
alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_cpu_release_event_type_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_cpu_release_event_type_check
  check (cpu_release_event_type is null or cpu_release_event_type in ('announcement', 'launch', 'first_product_availability', 'expected_availability', 'unknown'));
alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_cpu_release_confidence_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_cpu_release_confidence_check
  check (cpu_release_confidence is null or cpu_release_confidence between 0 and 100);

create index if not exists idx_hardware_enrichment_cpu_release_catalog
  on public.hardware_enrichment(cpu_release_catalog_id);

drop trigger if exists set_cpu_release_catalog_updated_at on public.cpu_release_catalog;
create trigger set_cpu_release_catalog_updated_at
before update on public.cpu_release_catalog
for each row execute function public.set_updated_at();

create or replace view public.device_inventory_view with (security_invoker = true) as
select
  d.id,
  d.dedupe_key,
  d.hostname,
  d.os_name,
  d.os_version,
  d.manufacturer,
  d.model,
  d.model_number,
  d.service_tag,
  d.hardware_identity,
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
  li.purchase_price as actual_purchase_price,
  li.currency as actual_purchase_currency,
  li.invoice_date as actual_purchase_date,
  li.id as actual_purchase_invoice_id,
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
  t.abbreviation as team_abbreviation,
  t.color as team_color,
  e.name as establishment_name,
  e.abbreviation as establishment_abbreviation,
  e.establishment_type,
  e.discipline as establishment_discipline,
  e.color as establishment_color,
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
  he.notes as enrichment_notes,
  he.resale_value,
  he.replacement_cost,
  he.book_value,
  he.valuation_method,
  he.valuation_confidence_label,
  he.valuation_reasons,
  he.market_observation_count,
  he.cpu_benchmark_source_url,
  he.cpu_release_catalog_id,
  he.cpu_release_period_start,
  he.cpu_release_period_end,
  he.cpu_release_precision,
  he.cpu_release_event_type,
  he.cpu_release_display,
  he.cpu_release_source_type,
  he.cpu_release_source_url,
  he.cpu_release_match_scope,
  he.cpu_release_match_method,
  he.cpu_release_confidence,
  he.cpu_release_is_official,
  he.cpu_release_last_verified_at,
  crc.vendor as cpu_release_vendor,
  crc.canonical_name as cpu_release_canonical_name,
  crc.source_title as cpu_release_source_title,
  crc.raw_release_value as cpu_release_raw_value
from public.devices d
left join public.users u on u.id = d.assigned_user_id
left join public.teams t on t.id = d.team_id
left join public.establishments e on e.id = d.establishment_id
left join public.hardware_enrichment he on he.device_id = d.id
left join public.cpu_release_catalog crc on crc.id = he.cpu_release_catalog_id
left join lateral (
  select di.id, di.purchase_price, di.currency, di.invoice_date
  from public.device_invoices di
  where di.device_id = d.id
    and di.invoice_type = 'purchase'
    and di.purchase_price is not null
  order by di.invoice_date desc nulls last, di.created_at desc
  limit 1
) li on true;

alter table public.cpu_release_catalog enable row level security;
alter table public.cpu_release_aliases enable row level security;
alter table public.cpu_release_sync_runs enable row level security;

revoke all privileges on public.cpu_release_catalog from anon, authenticated;
revoke all privileges on public.cpu_release_aliases from anon, authenticated;
revoke all privileges on public.cpu_release_sync_runs from anon, authenticated;
revoke all privileges on public.device_inventory_view from anon, authenticated;
