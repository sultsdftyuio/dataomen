-- Read-only inventory for the Supabase SQL editor. Run in the project being
-- audited; statistics are estimates since the last reset, not proof of use.
-- This returns metadata only and does not expose customer rows.
SELECT
    current_database() AS database_name,
    tables.relname AS table_name,
    COALESCE(stats.n_live_tup, 0) AS estimated_live_rows,
    pg_size_pretty(pg_total_relation_size(tables.oid)) AS total_size,
    COALESCE(stats.seq_scan, 0) AS sequential_scans,
    COALESCE(stats.idx_scan, 0) AS index_scans,
    tables.relrowsecurity AS rls_enabled,
    (
        SELECT count(*)
        FROM pg_constraint AS fk
        WHERE fk.contype = 'f'
          AND fk.confrelid = tables.oid
    ) AS incoming_foreign_keys,
    database_stats.stats_reset
FROM pg_class AS tables
JOIN pg_namespace AS schemas ON schemas.oid = tables.relnamespace
LEFT JOIN pg_stat_user_tables AS stats ON stats.relid = tables.oid
CROSS JOIN pg_stat_database AS database_stats
WHERE schemas.nspname = 'public'
  AND tables.relkind IN ('r', 'p')
  AND database_stats.datname = current_database()
ORDER BY tables.relname;
