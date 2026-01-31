-- Add column for response/resolution attachment
ALTER TABLE public.kpi_queries
ADD COLUMN resolution_evidence_url TEXT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.kpi_queries.resolution_evidence_url IS 
  'File URL for attachment included when resolving the query';