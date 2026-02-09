-- Add JSONB array columns for multi-file evidence support

-- review_submissions - multi-file support
ALTER TABLE review_submissions 
ADD COLUMN IF NOT EXISTS self_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS manager_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS auditor_evidence_urls JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS management_evidence_urls JSONB DEFAULT '[]';

-- Migrate existing single URLs to arrays
UPDATE review_submissions 
SET self_evidence_urls = CASE WHEN self_evidence_url IS NOT NULL AND self_evidence_url != '' THEN jsonb_build_array(self_evidence_url) ELSE '[]' END
WHERE self_evidence_urls = '[]' OR self_evidence_urls IS NULL;

UPDATE review_submissions 
SET manager_evidence_urls = CASE WHEN manager_evidence_url IS NOT NULL AND manager_evidence_url != '' THEN jsonb_build_array(manager_evidence_url) ELSE '[]' END
WHERE manager_evidence_urls = '[]' OR manager_evidence_urls IS NULL;

UPDATE review_submissions 
SET auditor_evidence_urls = CASE WHEN auditor_evidence_url IS NOT NULL AND auditor_evidence_url != '' THEN jsonb_build_array(auditor_evidence_url) ELSE '[]' END
WHERE auditor_evidence_urls = '[]' OR auditor_evidence_urls IS NULL;

UPDATE review_submissions 
SET management_evidence_urls = CASE WHEN management_evidence_url IS NOT NULL AND management_evidence_url != '' THEN jsonb_build_array(management_evidence_url) ELSE '[]' END
WHERE management_evidence_urls = '[]' OR management_evidence_urls IS NULL;

-- org_kpi_values - multi-file support
ALTER TABLE org_kpi_values ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]';

UPDATE org_kpi_values 
SET evidence_urls = CASE WHEN evidence_url IS NOT NULL AND evidence_url != '' THEN jsonb_build_array(evidence_url) ELSE '[]' END
WHERE evidence_urls = '[]' OR evidence_urls IS NULL;

-- kpi_queries - multi-file support
ALTER TABLE kpi_queries 
ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS resolution_evidence_urls JSONB DEFAULT '[]';

UPDATE kpi_queries 
SET evidence_urls = CASE WHEN evidence_url IS NOT NULL AND evidence_url != '' THEN jsonb_build_array(evidence_url) ELSE '[]' END
WHERE evidence_urls = '[]' OR evidence_urls IS NULL;

UPDATE kpi_queries 
SET resolution_evidence_urls = CASE WHEN resolution_evidence_url IS NOT NULL AND resolution_evidence_url != '' THEN jsonb_build_array(resolution_evidence_url) ELSE '[]' END
WHERE resolution_evidence_urls = '[]' OR resolution_evidence_urls IS NULL;

-- kpi_observations - multi-file support
ALTER TABLE kpi_observations ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]';

UPDATE kpi_observations 
SET evidence_urls = CASE WHEN evidence_url IS NOT NULL AND evidence_url != '' THEN jsonb_build_array(evidence_url) ELSE '[]' END
WHERE evidence_urls = '[]' OR evidence_urls IS NULL;