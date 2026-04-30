ALTER TABLE public.review_action_notes
  DROP CONSTRAINT IF EXISTS review_action_notes_category_check;

ALTER TABLE public.review_action_notes
  ADD CONSTRAINT review_action_notes_category_check
  CHECK (category IN (
    'kpi_change','weightage_change','target_change','new_kpi',
    'remove_kpi','role_realignment','training_need','reaudit','other'
  ));