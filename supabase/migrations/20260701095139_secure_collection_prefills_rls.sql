alter table public.collection_prefills enable row level security;

revoke all on table public.collection_prefills from anon;
revoke all on table public.collection_prefills from authenticated;

