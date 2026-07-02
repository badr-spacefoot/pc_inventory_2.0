alter table public.hardware_enrichment add column if not exists resale_value numeric;
alter table public.hardware_enrichment add column if not exists replacement_cost numeric;
alter table public.hardware_enrichment add column if not exists book_value numeric;
alter table public.hardware_enrichment add column if not exists valuation_method text not null default 'fallback_estimate';
alter table public.hardware_enrichment add column if not exists valuation_confidence_label text not null default 'D';
alter table public.hardware_enrichment add column if not exists valuation_reasons jsonb not null default '[]'::jsonb;
alter table public.hardware_enrichment add column if not exists market_observation_count integer not null default 0;

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_valuation_confidence_label_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_valuation_confidence_label_check
  check (valuation_confidence_label in ('A', 'B', 'C', 'D'));

alter table public.hardware_enrichment
  drop constraint if exists hardware_enrichment_market_observation_count_check;
alter table public.hardware_enrichment
  add constraint hardware_enrichment_market_observation_count_check
  check (market_observation_count >= 0);

update public.hardware_enrichment
set
  resale_value = coalesce(resale_value, estimated_current_value),
  replacement_cost = coalesce(replacement_cost, estimated_launch_price),
  book_value = coalesce(book_value, 0),
  valuation_method = case
    when coalesce(market_source, '') ilike '%ebay%' then 'market_blended'
    when coalesce(enrichment_source, '') ilike '%known-model%' then 'model_matched'
    when cpu_release_year is not null or model_release_year is not null then 'spec_estimate'
    else 'fallback_estimate'
  end,
  valuation_confidence_label = case
    when price_confidence_score >= 85 and coalesce(market_source, '') ilike '%ebay%' then 'A'
    when price_confidence_score >= 70 then 'B'
    when price_confidence_score >= 50 then 'C'
    else 'D'
  end,
  valuation_reasons = case
    when valuation_reasons is null or valuation_reasons = '[]'::jsonb then jsonb_build_array(
      'legacy_backfill',
      concat('market_observations:', coalesce(market_observation_count, 0)),
      concat('confidence_score:', coalesce(price_confidence_score, confidence_score, 0)),
      concat('source:', coalesce(enrichment_source, 'unknown'))
    )
    else valuation_reasons
  end,
  market_observation_count = coalesce(market_observation_count, 0);

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
  he.market_observation_count
from public.devices d
left join public.users u on u.id = d.assigned_user_id
left join public.teams t on t.id = d.team_id
left join public.establishments e on e.id = d.establishment_id
left join public.hardware_enrichment he on he.device_id = d.id;

revoke all privileges on public.device_inventory_view from anon, authenticated;
