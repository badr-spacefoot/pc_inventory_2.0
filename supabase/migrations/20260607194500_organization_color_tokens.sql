alter table public.establishments
  add column if not exists color text not null default '#5f6f7f';

alter table public.teams
  alter column color set default '#3b6ea8';

alter table public.establishments
  drop constraint if exists establishments_discipline_check;

alter table public.establishments
  add constraint establishments_discipline_check
  check (discipline in ('general', 'bike', 'racket', 'football', 'golf', 'lifestyle', 'running', 'office', 'warehouse', 'headquarters', 'remote', 'other'));

with palette(color, idx) as (
  values
    ('#3b6ea8', 0), ('#21867a', 1), ('#4f8a52', 2), ('#b88325', 3),
    ('#b86632', 4), ('#b45c75', 5), ('#7b61a8', 6), ('#4e68b0', 7),
    ('#2f8898', 8), ('#7a963f', 9), ('#64748b', 10), ('#b15f9a', 11)
),
ordered as (
  select id, row_number() over (order by coalesce(sort_index, 999999), name) - 1 as rn
  from public.teams
)
update public.teams t
set color = palette.color
from ordered
join palette on palette.idx = ordered.rn % 12
where t.id = ordered.id
  and (t.color is null or t.color = '#16735f');

with palette(color, idx) as (
  values
    ('#3b6ea8', 0), ('#21867a', 1), ('#4f8a52', 2), ('#b88325', 3),
    ('#b86632', 4), ('#b45c75', 5), ('#7b61a8', 6), ('#4e68b0', 7),
    ('#2f8898', 8), ('#7a963f', 9), ('#64748b', 10), ('#b15f9a', 11)
),
ordered as (
  select id, row_number() over (order by coalesce(sort_index, 999999), name) - 1 as rn
  from public.establishments
)
update public.establishments e
set color = palette.color
from ordered
join palette on palette.idx = ordered.rn % 12
where e.id = ordered.id
  and (e.color is null or e.color = '#5f6f7f');

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
