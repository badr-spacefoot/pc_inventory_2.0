create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  email text unique,
  role text not null default 'VIEWER'
    check (role in ('ADMIN', 'MANAGER', 'VIEWER', 'READ_ONLY', 'COLLECTOR_USER')),
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  severity text not null default 'INFO'
    check (severity in ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
  target_role text not null default 'ALL'
    check (target_role in ('ADMIN', 'MANAGER', 'VIEWER', 'READ_ONLY', 'COLLECTOR_USER', 'ALL')),
  target_user_id uuid references public.admin_users(id) on delete cascade,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_admin_users_username on public.admin_users(username);
create index if not exists idx_admin_users_role_active on public.admin_users(role, is_active);
create index if not exists idx_notifications_created on public.notifications(created_at desc);
create index if not exists idx_notifications_unread_role on public.notifications(target_role, is_read, created_at desc);
create index if not exists idx_notifications_target_user on public.notifications(target_user_id, is_read, created_at desc);

alter table public.admin_users enable row level security;
alter table public.notifications enable row level security;
