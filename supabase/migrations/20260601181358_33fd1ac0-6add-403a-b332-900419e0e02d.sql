DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'review_status' AND e.enumlabel = 'functional_manager_check'
  ) THEN
    ALTER TYPE public.review_status ADD VALUE 'functional_manager_check' AFTER 'manager_check';
  END IF;
END $$;