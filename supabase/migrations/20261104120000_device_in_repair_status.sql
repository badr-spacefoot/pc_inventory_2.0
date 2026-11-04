alter table public.devices
  drop constraint devices_status_check,
  add constraint devices_status_check
    check (status in ('active', 'replace', 'stock', 'lost', 'retired', 'in_repair'));
