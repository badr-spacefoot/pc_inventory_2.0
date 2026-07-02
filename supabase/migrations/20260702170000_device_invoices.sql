create table if not exists public.device_invoices (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  invoice_number text,
  supplier text,
  invoice_date date,
  purchase_price numeric check (purchase_price is null or purchase_price >= 0),
  currency text not null default 'EUR',
  file_name text,
  file_url text,
  file_path text,
  file_mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_invoices
  add column if not exists file_path text,
  add column if not exists file_mime_type text,
  add column if not exists file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0);

create index if not exists idx_device_invoices_device_date
  on public.device_invoices(device_id, invoice_date desc nulls last, created_at desc);

drop trigger if exists set_device_invoices_updated_at on public.device_invoices;
create trigger set_device_invoices_updated_at
before update on public.device_invoices
for each row execute function public.set_updated_at();

alter table public.device_invoices enable row level security;

revoke all privileges on public.device_invoices from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'device-invoices',
  'device-invoices',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
