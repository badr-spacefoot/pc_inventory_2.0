alter table public.cpu_benchmarks add column if not exists source_url text;
alter table public.hardware_enrichment add column if not exists cpu_benchmark_source_url text;

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
  he.cpu_benchmark_source_url
from public.devices d
left join public.users u on u.id = d.assigned_user_id
left join public.teams t on t.id = d.team_id
left join public.establishments e on e.id = d.establishment_id
left join public.hardware_enrichment he on he.device_id = d.id
left join lateral (
  select di.id, di.purchase_price, di.currency, di.invoice_date
  from public.device_invoices di
  where di.device_id = d.id
    and di.purchase_price is not null
  order by di.invoice_date desc nulls last, di.created_at desc
  limit 1
) li on true;
