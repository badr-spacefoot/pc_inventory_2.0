-- Spacefoot IT Inventory osquery pack.
-- Run each query with: osqueryi --json "<query>"

select * from system_info limit 1;

select * from os_version limit 1;

select version from osquery_info limit 1;

select * from mounts;

select * from disk_info;

select * from memory_devices;

select * from interface_details;

select * from interface_addresses;

select user, tty, host, time from logged_in_users;
