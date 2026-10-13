-- One-time cleanup: remove cached embedding vectors from match rows.
--
-- Each public post keeps its embedding in public.source_posts.metadata under
-- 'matching_embedding_cache'. Workers before this fix copied that whole
-- metadata object into every match built from an already-embedded post: once
-- into lead_matches.metadata and once into each stored post snapshot. One
-- vector is about 30 KB of numbers, so an affected lead row grew from roughly
-- 2 KB to over 150 KB, and the dashboard downloaded all of it on every load.
--
-- The worker no longer writes the vector there. This script removes it from
-- the rows written earlier.
--
-- Safe to run more than once: it only rewrites rows that still carry the key.
-- It changes nothing else in those rows: status, scores, verdicts, the post
-- snapshot and provider context (community, repository, site) are untouched,
-- and lead_matches.updated_at is not modified, so the dashboard's
-- "matches since the current website" filter keeps its meaning.
-- public.source_posts is deliberately left alone: the cache belongs there.

BEGIN;

DO $$
DECLARE
    target RECORD;
    cleaned BIGINT;
BEGIN
    FOR target IN
        SELECT *
          FROM (
            VALUES
                -- (table, column, vector sits under the snapshot's metadata)
                ('lead_matches', 'metadata', FALSE),
                ('lead_matches', 'source_post', TRUE),
                ('lead_matches', 'source_post_data', TRUE),
                ('lead_matches', 'source_post_json', TRUE),
                ('lead_matches', 'post', TRUE),
                ('watchlist_matches', 'metadata', FALSE),
                ('watchlist_matches', 'source_post', TRUE)
          ) AS listed(table_name, column_name, is_snapshot)
    LOOP
        -- Older workspaces predate some snapshot aliases and the Watchlist
        -- tables; skip whatever this database does not have.
        IF NOT EXISTS (
            SELECT 1
              FROM information_schema.columns AS existing
             WHERE existing.table_schema = 'public'
               AND existing.table_name = target.table_name
               AND existing.column_name = target.column_name
               AND existing.udt_name = 'jsonb'
        ) THEN
            CONTINUE;
        END IF;

        IF target.is_snapshot THEN
            EXECUTE format(
                'UPDATE public.%1$I
                    SET %2$I = %2$I #- ''{metadata,matching_embedding_cache}''
                  WHERE jsonb_typeof(%2$I -> ''metadata'') = ''object''
                    AND (%2$I -> ''metadata'') ? ''matching_embedding_cache''',
                target.table_name,
                target.column_name
            );
        ELSE
            EXECUTE format(
                'UPDATE public.%1$I
                    SET %2$I = %2$I - ''matching_embedding_cache''
                  WHERE jsonb_typeof(%2$I) = ''object''
                    AND %2$I ? ''matching_embedding_cache''',
                target.table_name,
                target.column_name
            );
        END IF;

        GET DIAGNOSTICS cleaned = ROW_COUNT;
        RAISE NOTICE 'public.%.%: removed the cached vector from % row(s)',
            target.table_name, target.column_name, cleaned;
    END LOOP;
END;
$$;

COMMIT;
