-- Fixes: saving Settings in the Install EOD admin app always failed with a 400
-- ("null value in column "value" of relation "eod_config" violates not-null
-- constraint") whenever the "Default installer" was set to "None" — which stores
-- default_installer_id as JSON null, and PostgREST writes a top-level JSON null
-- as SQL NULL, violating the NOT NULL constraint on eod_config.value. Every
-- Settings save re-submits the full config (including default_installer_id),
-- so this blocked ALL Settings saves, not just the default-installer field.
--
-- eod_config is a generic key/value store; a genuinely absent/unset value is a
-- legitimate state for any key, so dropping NOT NULL here is safe and correct.

alter table eod_config alter column value drop not null;
