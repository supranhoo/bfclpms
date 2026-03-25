
-- Temporarily disable the locked period trigger to allow data repair
ALTER TABLE review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

-- Fix self_rating mismatches
UPDATE review_submissions
SET self_rating = CASE
  WHEN ROUND(self_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(self_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(self_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE self_score IS NOT NULL AND self_rating IS NOT NULL
  AND self_rating != CASE
    WHEN ROUND(self_score) >= 5 THEN 'blue'::rating_level
    WHEN ROUND(self_score) >= 4 THEN 'green'::rating_level
    WHEN ROUND(self_score) >= 3 THEN 'yellow'::rating_level
    ELSE 'red'::rating_level
  END;

-- Fix final_rating mismatches
UPDATE review_submissions
SET final_rating = CASE
  WHEN ROUND(final_score) >= 5 THEN 'blue'::rating_level
  WHEN ROUND(final_score) >= 4 THEN 'green'::rating_level
  WHEN ROUND(final_score) >= 3 THEN 'yellow'::rating_level
  ELSE 'red'::rating_level
END
WHERE final_score IS NOT NULL AND final_rating IS NOT NULL
  AND final_rating != CASE
    WHEN ROUND(final_score) >= 5 THEN 'blue'::rating_level
    WHEN ROUND(final_score) >= 4 THEN 'green'::rating_level
    WHEN ROUND(final_score) >= 3 THEN 'yellow'::rating_level
    ELSE 'red'::rating_level
  END;

-- Re-enable the trigger
ALTER TABLE review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;
