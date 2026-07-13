create table if not exists public.admin_user_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  token_prefix text not null,
  username text not null,
  display_name text not null,
  email text not null,
  role text not null default 'VIEWER'
    check (role in ('ADMIN', 'MANAGER', 'VIEWER', 'READ_ONLY')),
  expires_at timestamptz not null,
  created_by uuid references public.admin_users(id) on delete set null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.admin_users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_user_invites_terminal_state_check
    check (accepted_at is null or revoked_at is null)
);

create index if not exists idx_admin_user_invites_status_expiry
  on public.admin_user_invites(accepted_at, revoked_at, expires_at desc);
create index if not exists idx_admin_user_invites_username
  on public.admin_user_invites(lower(username));
create index if not exists idx_admin_user_invites_email
  on public.admin_user_invites(lower(email));

alter table public.admin_user_invites enable row level security;

-- Account invitations are only accessed through the inventory-api Edge Function.
revoke all privileges on public.admin_user_invites from anon, authenticated;
grant select, insert, update, delete on public.admin_user_invites to service_role;
