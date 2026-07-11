-- ============================================================
-- DDL Integrity Catalog Queries
-- Proves tables, owner, RLS status, BYPASSRLS status, constraints, triggers
-- ============================================================

\set ON_ERROR_STOP on

-- ── 1. Proves RLS is Enabled and Forced on expected tables ─────────────────
\echo '=== ROW LEVEL SECURITY STATUS ==='
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE schemaname IN ('identity', 'science', 'governance', 'outbox')
ORDER BY schemaname, tablename;

-- ── 2. Prove application role is NOT table owner ───────────────────────────
\echo ''
\echo '=== TABLE OWNERSHIP AND OWNER ROLES (Expect NOT difaryx_app) ==='
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname IN ('identity', 'science', 'governance', 'outbox')
  AND tableowner = 'difaryx_app';

-- ── 3. Prove application role has NO BYPASSRLS privilege ───────────────────
\echo ''
\echo '=== ROLE ATTRIBUTES FOR APP ROLE ==='
SELECT 
    rolname, 
    rolsuper AS is_superuser, 
    rolbypassrls AS has_bypassrls
FROM pg_roles 
WHERE rolname IN ('difaryx_app', 'difaryx_owner');

-- ── 4. Verify triggers exist ───────────────────────────────────────────────
\echo ''
\echo '=== USER-DEFINED TRIGGERS ==='
SELECT 
    tgrelid::regclass AS table_name,
    tgname AS trigger_name,
    tgenabled AS trigger_enabled
FROM pg_trigger
WHERE tgisinternal = false;

-- ── 5. Verify check constraints exist and are validated ───────────────────
\echo ''
\echo '=== CHECK CONSTRAINTS VALIDATED ==='
SELECT 
    conrelid::regclass AS table_name,
    conname AS constraint_name,
    contype AS constraint_type,
    convalidated AS is_validated
FROM pg_constraint
WHERE contype = 'c' 
  AND connamespace::regnamespace::text IN ('science', 'governance', 'outbox')
ORDER BY table_name;
