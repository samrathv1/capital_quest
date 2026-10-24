-- CAPITAL QUEST: REAL DATABASE VERIFICATION SCRIPT
-- Executes against linked Supabase development PostgreSQL instance

-- TEST SUITE 1: Verify all 14 tables and RLS status
SELECT 
    t.tablename,
    t.rowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

-- TEST SUITE 2: Verify Function search_path security (SEC-01)
SELECT 
    p.proname,
    p.prosecdef AS is_security_definer,
    p.proconfig AS configuration
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_commit_simulation_run', 'fn_void_or_supersede_round', 'get_user_role', 'is_super_admin', 'is_staff')
ORDER BY p.proname;

-- TEST SUITE 3: Verify RPC Execution Permissions (SEC-02)
SELECT 
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public'
  AND routine_name IN ('fn_commit_simulation_run', 'fn_void_or_supersede_round')
ORDER BY routine_name, grantee;

-- TEST SUITE 4: Verify Column Data Types & Precision (NUMERIC(15,2))
SELECT 
    table_name,
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('company_snapshots', 'financial_ledger', 'equity_transactions')
  AND column_name IN ('cash', 'revenue', 'net_income', 'company_valuation', 'amount', 'running_balance', 'investment_amount', 'post_money_valuation')
ORDER BY table_name, column_name;
