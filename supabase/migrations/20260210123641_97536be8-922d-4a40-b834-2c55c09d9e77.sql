-- Fix 3 KPIs for ABHAS LUHARUWALLA (100856) Sep 2025 that should be N/A
UPDATE review_submissions
SET is_na = true, final_score = NULL, self_score = NULL
WHERE kpi_id IN (
  'e38b5740-cd7d-483b-aaba-4860841a5329',
  'fbd28bb9-8701-45f9-9441-ecbf726dfbb7',
  'ca47f457-c989-4bf0-8b19-b5ddac981b97'
)
AND achieved_value IS NULL;