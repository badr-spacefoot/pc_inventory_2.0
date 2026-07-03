create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  mode text not null default 'refresh',
  force boolean not null default true,
  use_external boolean not null default true,
  total_count integer not null default 0 check (total_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  enriched_count integer not null default 0 check (enriched_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  ebay_result_count integer not null default 0 check (ebay_result_count >= 0),
  provider_statuses jsonb not null default '{}'::jsonb,
  last_error text,
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_enrichment_jobs_status_updated
  on public.enrichment_jobs(status, updated_at desc);

alter table public.enrichment_jobs enable row level security;
