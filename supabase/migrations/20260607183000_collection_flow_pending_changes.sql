create table if not exists public.pending_changes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('TEAM', 'LOCATION', 'ESTABLISHMENT', 'OTHER')),
  proposed_value text not null,
  proposed_by_user text,
  proposed_by_email text,
  related_device_id uuid references public.devices(id) on delete set null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED')),
  admin_decision_by uuid references public.admin_users(id) on delete set null,
  admin_decision_at timestamptz,
  admin_notes text,
  linked_entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_changes_status_created
  on public.pending_changes(status, created_at desc);

create index if not exists idx_pending_changes_type_value
  on public.pending_changes(type, lower(proposed_value));

alter table public.pending_changes enable row level security;
