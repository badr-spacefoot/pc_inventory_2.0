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

alter table public.establishments
  drop constraint if exists establishments_latitude_check;
alter table public.establishments
  add constraint establishments_latitude_check
  check (latitude is null or latitude between -90 and 90);

alter table public.establishments
  drop constraint if exists establishments_longitude_check;
alter table public.establishments
  add constraint establishments_longitude_check
  check (longitude is null or longitude between -180 and 180);

alter table public.establishments
  drop constraint if exists establishments_type_check;
alter table public.establishments
  add constraint establishments_type_check
  check (establishment_type in ('warehouse', 'store', 'headquarters', 'research', 'accounting', 'office', 'other'));
