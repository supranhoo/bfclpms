
-- Query ticket numbers
CREATE SEQUENCE public.query_ticket_seq START 1;

ALTER TABLE public.kpi_queries
ADD COLUMN ticket_number text
  UNIQUE
  DEFAULT 'Q-' || lpad(nextval('public.query_ticket_seq')::text, 5, '0');

-- Observation ticket numbers
CREATE SEQUENCE public.observation_ticket_seq START 1;

ALTER TABLE public.kpi_observations
ADD COLUMN ticket_number text
  UNIQUE
  DEFAULT 'OBS-' || lpad(nextval('public.observation_ticket_seq')::text, 5, '0');

-- Backfill existing queries
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.kpi_queries WHERE ticket_number IS NULL
)
UPDATE public.kpi_queries q
SET ticket_number = 'Q-' || lpad(n.rn::text, 5, '0')
FROM numbered n WHERE q.id = n.id;

-- Backfill existing observations
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.kpi_observations WHERE ticket_number IS NULL
)
UPDATE public.kpi_observations o
SET ticket_number = 'OBS-' || lpad(n.rn::text, 5, '0')
FROM numbered n WHERE o.id = n.id;

-- Advance sequences past existing records
SELECT setval('public.query_ticket_seq',
  COALESCE((SELECT COUNT(*) FROM public.kpi_queries), 0) + 1, false);
SELECT setval('public.observation_ticket_seq',
  COALESCE((SELECT COUNT(*) FROM public.kpi_observations), 0) + 1, false);
