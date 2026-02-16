
-- Sync single-URL evidence into JSONB array columns for all 6 reviewer levels
UPDATE review_submissions
SET self_evidence_urls = jsonb_build_array(self_evidence_url)
WHERE self_evidence_url IS NOT NULL
  AND self_evidence_url != ''
  AND (self_evidence_urls IS NULL OR self_evidence_urls = '[]'::jsonb);

UPDATE review_submissions
SET manager_evidence_urls = jsonb_build_array(manager_evidence_url)
WHERE manager_evidence_url IS NOT NULL
  AND manager_evidence_url != ''
  AND (manager_evidence_urls IS NULL OR manager_evidence_urls = '[]'::jsonb);

UPDATE review_submissions
SET auditor_evidence_urls = jsonb_build_array(auditor_evidence_url)
WHERE auditor_evidence_url IS NOT NULL
  AND auditor_evidence_url != ''
  AND (auditor_evidence_urls IS NULL OR auditor_evidence_urls = '[]'::jsonb);

UPDATE review_submissions
SET management_evidence_urls = jsonb_build_array(management_evidence_url)
WHERE management_evidence_url IS NOT NULL
  AND management_evidence_url != ''
  AND (management_evidence_urls IS NULL OR management_evidence_urls = '[]'::jsonb);

UPDATE review_submissions
SET skip_level_evidence_urls = jsonb_build_array(skip_level_evidence_url)
WHERE skip_level_evidence_url IS NOT NULL
  AND skip_level_evidence_url != ''
  AND (skip_level_evidence_urls IS NULL OR skip_level_evidence_urls = '[]'::jsonb);

UPDATE review_submissions
SET hr_pms_evidence_urls = jsonb_build_array(hr_pms_evidence_url)
WHERE hr_pms_evidence_url IS NOT NULL
  AND hr_pms_evidence_url != ''
  AND (hr_pms_evidence_urls IS NULL OR hr_pms_evidence_urls = '[]'::jsonb);
