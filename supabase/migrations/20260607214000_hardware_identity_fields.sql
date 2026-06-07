alter table public.devices add column if not exists model_number text;
alter table public.devices add column if not exists service_tag text;
alter table public.devices add column if not exists hardware_identity jsonb not null default '{}'::jsonb;

alter table public.device_scans add column if not exists model_number text;
alter table public.device_scans add column if not exists service_tag text;
alter table public.device_scans add column if not exists hardware_identity jsonb not null default '{}'::jsonb;

drop view if exists public.device_inventory_view;

create or replace view public.device_inventory_view as
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
  he.notes as enrichment_notes
from public.devices d
left join public.users u on u.id = d.assigned_user_id
left join public.teams t on t.id = d.team_id
left join public.establishments e on e.id = d.establishment_id
left join public.hardware_enrichment he on he.device_id = d.id;
