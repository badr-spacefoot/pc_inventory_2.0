-- Server-only security state. Existing stateless sessions expire immediately on API rollout.
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_sessions_user_id on public.admin_sessions(user_id);
create index if not exists idx_admin_sessions_expires_at on public.admin_sessions(expires_at);
create table if not exists public.login_attempt_windows (
  key_hash text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
create or replace function public.take_login_attempt(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.login_attempt_windows where window_start < now() - interval '1 day';
  insert into public.login_attempt_windows(key_hash,window_start,attempts) values(p_key,now(),1)
  on conflict(key_hash) do update set
    window_start = case when login_attempt_windows.window_start < now()-make_interval(secs=>p_seconds) then now() else login_attempt_windows.window_start end,
    attempts = case when login_attempt_windows.window_start < now()-make_interval(secs=>p_seconds) then 1 else login_attempt_windows.attempts+1 end
  returning attempts into n;
  return n <= p_limit;
end $$;
create or replace function public.revoke_changed_admin_sessions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.password_hash is distinct from old.password_hash or new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    delete from public.admin_sessions where user_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists revoke_changed_admin_sessions on public.admin_users;
create trigger revoke_changed_admin_sessions after update on public.admin_users
for each row execute function public.revoke_changed_admin_sessions();

create or replace function public.consume_collection_invite(p_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare consumed uuid;
begin
  update public.collection_invites set use_count=use_count+1,last_used_at=now()
  where invite_code=p_code and revoked_at is null and expires_at>now()
    and (max_uses is null or use_count<max_uses) returning id into consumed;
  return consumed;
end $$;
alter table public.collection_tokens add column if not exists device_id uuid references public.devices(id) on delete cascade;
create index if not exists idx_collection_tokens_device_id on public.collection_tokens(device_id);

-- Persist job membership; claims have fencing tokens so a stale worker cannot complete a newer lease.
create table if not exists public.enrichment_job_items (
  job_id uuid not null references public.enrichment_jobs(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','running','done')),
  claim_id uuid,
  lease_until timestamptz,
  result jsonb,
  primary key(job_id,device_id)
);
create index if not exists idx_enrichment_job_items_device_id on public.enrichment_job_items(device_id);
alter table public.enrichment_jobs add column if not exists initialized_at timestamptz;
create or replace function public.initialize_enrichment_job(p_job uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.enrichment_jobs where id=p_job for update;
  if exists(select 1 from public.enrichment_jobs where id=p_job and initialized_at is null) then
    insert into public.enrichment_job_items(job_id,device_id) select p_job,id from public.devices;
    update public.enrichment_jobs set initialized_at=now(),total_count=(select count(*) from public.enrichment_job_items where job_id=p_job),processed_count=0,enriched_count=0,skipped_count=0,failed_count=0 where id=p_job;
  end if;
  if not exists(select 1 from public.enrichment_job_items where job_id=p_job and status<>'done') then
    update public.enrichment_jobs set status='completed',finished_at=now(),updated_at=now() where id=p_job;
  end if;
end $$;
create or replace function public.claim_enrichment_items(p_job uuid,p_limit integer)
returns setof public.enrichment_job_items language plpgsql security definer set search_path=public as $$
begin
  return query with picked as (
    select i.job_id,i.device_id from public.enrichment_job_items i
    join public.enrichment_jobs j on j.id=i.job_id
    where i.job_id=p_job and j.status in ('queued','running') and
      (i.status='queued' or (i.status='running' and i.lease_until<now()))
    order by i.device_id for update of i skip locked limit greatest(1,least(p_limit,25))
  ) update public.enrichment_job_items i set status='running',claim_id=gen_random_uuid(),lease_until=now()+interval '15 minutes'
    from picked p where i.job_id=p.job_id and i.device_id=p.device_id returning i.*;
end $$;
create or replace function public.finish_enrichment_item(p_job uuid,p_device uuid,p_claim uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.enrichment_jobs where id=p_job and status in ('queued','running') for update;
  if not found then return; end if;
  update public.enrichment_job_items set status='done',result=p_result,lease_until=null
    where job_id=p_job and device_id=p_device and claim_id=p_claim and status='running';
  update public.enrichment_jobs j set
    total_count=(select count(*) from public.enrichment_job_items where job_id=p_job),
    processed_count=(select count(*) from public.enrichment_job_items where job_id=p_job and status='done'),
    skipped_count=(select count(*) from public.enrichment_job_items where job_id=p_job and status='done' and result->>'skipped'='true'),
    failed_count=(select count(*) from public.enrichment_job_items where job_id=p_job and status='done' and result->>'failed'='true'),
    enriched_count=(select count(*) from public.enrichment_job_items where job_id=p_job and status='done' and coalesce(result->>'failed','false')<>'true' and coalesce(result->>'skipped','false')<>'true'),
    ebay_result_count=(select coalesce(sum((result->'providerCounts'->>'ebay')::integer),0) from public.enrichment_job_items where job_id=p_job and status='done'),
    provider_statuses=jsonb_build_object('ebay',(select coalesce(jsonb_agg(distinct result->'providerStatus'->'ebay'->>'status') filter(where result->'providerStatus'->'ebay'->>'status' is not null),'[]'::jsonb) from public.enrichment_job_items where job_id=p_job and status='done')),
    status=case when not exists(select 1 from public.enrichment_job_items where job_id=p_job and status<>'done') then 'completed' else 'running' end,
    finished_at=case when not exists(select 1 from public.enrichment_job_items where job_id=p_job and status<>'done') then now() else null end,
    updated_at=now()
    where j.id=p_job;
end $$;

create table if not exists public.invoice_cleanup_queue (
  file_path text primary key,
  version uuid not null default gen_random_uuid(),
  ready_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.device_invoices add column if not exists request_id uuid;
create unique index if not exists idx_device_invoices_request on public.device_invoices(device_id,request_id) where request_id is not null;
create or replace function public.queue_deleted_invoice_file()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.file_path is not null then
    insert into public.invoice_cleanup_queue(file_path) values(old.file_path)
    on conflict(file_path) do update set ready_at=now(),version=gen_random_uuid();
  end if;
  return old;
end $$;
drop trigger if exists queue_deleted_invoice_file on public.device_invoices;
create trigger queue_deleted_invoice_file before delete on public.device_invoices
for each row execute function public.queue_deleted_invoice_file();

create or replace function public.invalidate_deleted_invoice_valuation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.invoice_type='purchase' then
    update public.hardware_enrichment set book_value=null,valuation_method='fallback_estimate',
      valuation_confidence_label='D',confidence_score=0,price_confidence_score=0,
      enrichment_source='invoice_pending',enrichment_status='pending',raw_data=raw_data-'invoice',
      valuation_reasons='[]'::jsonb,notes='Purchase invoice changed; valuation requires recalculation.'
    where device_id=old.device_id and valuation_method='invoice_backed';
  end if;
  return old;
end $$;
drop trigger if exists invalidate_deleted_invoice_valuation on public.device_invoices;
create trigger invalidate_deleted_invoice_valuation after delete on public.device_invoices
for each row execute function public.invalidate_deleted_invoice_valuation();

create or replace function public.record_inserted_invoice_history()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.device_history(device_id,event_type,field_name,new_value,changed_by,source,notes)
  values(new.device_id,'INVOICE_ADDED','invoice',concat_ws(' | ',new.invoice_type,new.supplier,new.invoice_number,
    case when new.purchase_price is not null then new.purchase_price::text||' '||new.currency end),
    coalesce(new.created_by,'admin'),'MANUAL_ADMIN',new.notes);
  if new.invoice_type='purchase' then
    update public.hardware_enrichment set book_value=null,valuation_method='fallback_estimate',
      valuation_confidence_label='D',confidence_score=0,price_confidence_score=0,
      enrichment_source='invoice_pending',enrichment_status='pending',raw_data=raw_data-'invoice',
      valuation_reasons='[]'::jsonb,notes='Purchase invoice changed; valuation requires recalculation.'
    where device_id=new.device_id and valuation_method='invoice_backed';
  end if;
  return new;
end $$;
drop trigger if exists record_inserted_invoice_history on public.device_invoices;
create trigger record_inserted_invoice_history after insert on public.device_invoices for each row execute function public.record_inserted_invoice_history();

create or replace function public.accept_admin_invitation(p_token_hash text,p_password_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare invitation public.admin_user_invites; account public.admin_users;
begin
  select * into invitation from public.admin_user_invites where token_hash=p_token_hash for update;
  if not found or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at<=now() then
    raise exception 'Invitation unavailable' using errcode='P0001';
  end if;
  insert into public.admin_users(username,display_name,email,role,password_hash,is_active)
    values(invitation.username,invitation.display_name,invitation.email,invitation.role,p_password_hash,true)
    returning * into account;
  update public.admin_user_invites set accepted_at=now(),accepted_user_id=account.id where id=invitation.id;
  return to_jsonb(account)-'password_hash';
end $$;

create or replace function public.create_admin_session(p_user uuid,p_password_hash text,p_expiry timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare session_id uuid;
begin
  perform 1 from public.admin_users where id=p_user and is_active and password_hash=p_password_hash for update;
  if not found then raise exception 'Account credentials changed' using errcode='P0001'; end if;
  delete from public.admin_sessions where expires_at<now();
  insert into public.admin_sessions(user_id,expires_at) values(p_user,least(p_expiry,now()+interval '12 hours')) returning id into session_id;
  return session_id;
end $$;

-- Durable metadata-only audit events in the same transaction as sensitive mutations.
create or replace function public.audit_sensitive_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(action,entity_type,entity_id,details)
  values('db_'||lower(TG_OP),TG_TABLE_NAME,case when TG_OP='DELETE' then old.id else new.id end,
    jsonb_build_object('transactional',true));
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists audit_admin_users on public.admin_users;
create trigger audit_admin_users after insert or update or delete on public.admin_users for each row execute function public.audit_sensitive_mutation();
drop trigger if exists audit_device_invoices on public.device_invoices;
create trigger audit_device_invoices after insert or update or delete on public.device_invoices for each row execute function public.audit_sensitive_mutation();
drop trigger if exists audit_devices on public.devices;
create trigger audit_devices after insert or update or delete on public.devices for each row execute function public.audit_sensitive_mutation();

alter table public.admin_sessions enable row level security;
alter table public.login_attempt_windows enable row level security;
alter table public.enrichment_job_items enable row level security;
alter table public.invoice_cleanup_queue enable row level security;
revoke all on public.admin_sessions,public.login_attempt_windows,public.enrichment_job_items,public.invoice_cleanup_queue,public.enrichment_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.admin_sessions,public.login_attempt_windows,public.enrichment_job_items,public.invoice_cleanup_queue,public.enrichment_jobs to service_role;
revoke all on function public.take_login_attempt(text,integer,integer),public.revoke_changed_admin_sessions(),public.consume_collection_invite(text),public.initialize_enrichment_job(uuid),public.claim_enrichment_items(uuid,integer),public.finish_enrichment_item(uuid,uuid,uuid,jsonb),public.queue_deleted_invoice_file(),public.audit_sensitive_mutation() from public,anon,authenticated;
grant execute on function public.take_login_attempt(text,integer,integer),public.revoke_changed_admin_sessions(),public.consume_collection_invite(text),public.initialize_enrichment_job(uuid),public.claim_enrichment_items(uuid,integer),public.finish_enrichment_item(uuid,uuid,uuid,jsonb),public.queue_deleted_invoice_file(),public.audit_sensitive_mutation() to service_role;
revoke all on function public.invalidate_deleted_invoice_valuation(),public.accept_admin_invitation(text,text),public.create_admin_session(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.invalidate_deleted_invoice_valuation(),public.accept_admin_invitation(text,text),public.create_admin_session(uuid,text,timestamptz) to service_role;
revoke all on function public.record_inserted_invoice_history() from public,anon,authenticated;
grant execute on function public.record_inserted_invoice_history() to service_role;
