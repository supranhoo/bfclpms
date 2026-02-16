
-- Add query_type column to kpi_queries
ALTER TABLE public.kpi_queries ADD COLUMN query_type TEXT NOT NULL DEFAULT 'query';

-- Backfill existing send-backs
UPDATE public.kpi_queries
SET query_type = 'send_back',
    status = 'resolved',
    resolved_at = COALESCE(resolved_at, now())
WHERE reason LIKE '[SENT BACK]%' OR reason LIKE '[ADMIN SENT BACK]%';
