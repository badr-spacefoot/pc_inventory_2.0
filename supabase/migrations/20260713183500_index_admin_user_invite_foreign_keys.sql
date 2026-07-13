create index if not exists idx_admin_user_invites_created_by
  on public.admin_user_invites(created_by);

create index if not exists idx_admin_user_invites_accepted_user_id
  on public.admin_user_invites(accepted_user_id);
