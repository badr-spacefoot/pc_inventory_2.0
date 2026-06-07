alter table public.teams add column if not exists sort_index integer;
alter table public.establishments add column if not exists sort_index integer;

alter table public.establishments
  drop constraint if exists establishments_establishment_type_check;
alter table public.establishments
  add constraint establishments_establishment_type_check
  check (establishment_type in ('warehouse', 'store', 'headquarters', 'research', 'accounting', 'office', 'remote', 'other'));

with ordered as (
  select id, row_number() over (order by name) - 1 as position
  from public.teams
)
update public.teams
set sort_index = ordered.position
from ordered
where public.teams.id = ordered.id
  and public.teams.sort_index is null;

with ordered as (
  select id, row_number() over (order by name) - 1 as position
  from public.establishments
)
update public.establishments
set sort_index = ordered.position
from ordered
where public.establishments.id = ordered.id
  and public.establishments.sort_index is null;

create table if not exists public.device_history (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  event_type text not null,
  field_name text,
  old_value text,
  new_value text,
  changed_by text not null default 'system',
  source text not null default 'collector',
  notes text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_device_history_device_changed
  on public.device_history(device_id, changed_at desc);
create index if not exists idx_teams_sort_index
  on public.teams(sort_index, name);
create index if not exists idx_establishments_sort_index
  on public.establishments(sort_index, name);

alter table public.device_history enable row level security;
