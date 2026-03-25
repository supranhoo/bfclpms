
-- Temporarily disable the lock trigger to allow data repair
ALTER TABLE review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

-- Part 1: Fix score=22 anomaly (cap to 5)
UPDATE review_submissions SET management_score = 5
WHERE management_score > 5;

-- Part 2a: Fix hr_pms_rating mismatches
UPDATE review_submissions
SET hr_pms_rating = CASE
  WHEN ROUND(hr_pms_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(hr_pms_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(hr_pms_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE hr_pms_score IS NOT NULL AND hr_pms_rating IS NOT NULL
  AND hr_pms_rating != (CASE WHEN ROUND(hr_pms_score)>=5 THEN 'blue' WHEN ROUND(hr_pms_score)>=4 THEN 'green' WHEN ROUND(hr_pms_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;

-- Part 2b: Fix management_rating mismatches
UPDATE review_submissions
SET management_rating = CASE
  WHEN ROUND(management_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(management_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(management_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE management_score IS NOT NULL AND management_rating IS NOT NULL
  AND management_rating != (CASE WHEN ROUND(management_score)>=5 THEN 'blue' WHEN ROUND(management_score)>=4 THEN 'green' WHEN ROUND(management_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;

-- Part 2c: Fix auditor_rating mismatches
UPDATE review_submissions
SET auditor_rating = CASE
  WHEN ROUND(auditor_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(auditor_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(auditor_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE auditor_score IS NOT NULL AND auditor_rating IS NOT NULL
  AND auditor_rating != (CASE WHEN ROUND(auditor_score)>=5 THEN 'blue' WHEN ROUND(auditor_score)>=4 THEN 'green' WHEN ROUND(auditor_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;

-- Part 2d: Fix final_rating mismatches
UPDATE review_submissions
SET final_rating = CASE
  WHEN ROUND(final_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(final_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(final_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE final_score IS NOT NULL AND final_rating IS NOT NULL
  AND final_rating != (CASE WHEN ROUND(final_score)>=5 THEN 'blue' WHEN ROUND(final_score)>=4 THEN 'green' WHEN ROUND(final_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;

-- Re-enable the lock trigger
ALTER TABLE review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;
