-- Extensions used across KaamSetu.
-- pg_cron must live in pg_catalog on Supabase (it creates its own `cron` schema).
-- pg_net creates its own `net` schema; the `extensions` schema clause is required by Supabase.
-- pgTAP is NOT installed here (it must not ship to production): each test file creates it
-- inside its own rolled-back transaction.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
