-- Temporarily disable the locked-period trigger to patch historical data
ALTER TABLE review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

-- Fix all records where is_na=true but na_marked_by_role was never set
UPDATE review_submissions
SET na_marked_by_role = 'employee'
WHERE is_na = true AND na_marked_by_role IS NULL;

-- Re-enable the trigger
ALTER TABLE review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;