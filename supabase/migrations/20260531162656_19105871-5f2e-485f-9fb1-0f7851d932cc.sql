-- Normalize non-canonical criterion_key values on
-- increment_eligibility_criteria so the compute-increment engine evaluates
-- them against the right input metric. Without this fix, an admin who renamed
-- "Absent Days" -> "Absent" produced criterion_key='absent', which the engine
-- silently skipped (no metric mapping), wrongly awarding 20% increment.
UPDATE public.increment_eligibility_criteria
SET criterion_key = CASE lower(trim(criterion_key))
  WHEN 'absent'              THEN 'absent_days'
  WHEN 'absent_day'          THEN 'absent_days'
  WHEN 'absence'             THEN 'absent_days'
  WHEN 'absences'            THEN 'absent_days'
  WHEN 'lwp'                 THEN 'lwp_days'
  WHEN 'lwp_day'             THEN 'lwp_days'
  WHEN 'leave_without_pay'   THEN 'lwp_days'
  WHEN 'discipline'          THEN 'disciplinary_actions'
  WHEN 'discipline_action'   THEN 'disciplinary_actions'
  WHEN 'disciplinary'        THEN 'disciplinary_actions'
  WHEN 'disciplinary_action' THEN 'disciplinary_actions'
  WHEN 'training'            THEN 'training_compliance'
  WHEN 'training_program'    THEN 'training_compliance'
  WHEN 'training_programs'   THEN 'training_compliance'
  ELSE criterion_key
END,
updated_at = now()
WHERE lower(trim(criterion_key)) IN (
  'absent','absent_day','absence','absences',
  'lwp','lwp_day','leave_without_pay',
  'discipline','discipline_action','disciplinary','disciplinary_action',
  'training','training_program','training_programs'
)
AND criterion_key <> CASE lower(trim(criterion_key))
  WHEN 'absent'              THEN 'absent_days'
  WHEN 'absent_day'          THEN 'absent_days'
  WHEN 'absence'             THEN 'absent_days'
  WHEN 'absences'            THEN 'absent_days'
  WHEN 'lwp'                 THEN 'lwp_days'
  WHEN 'lwp_day'             THEN 'lwp_days'
  WHEN 'leave_without_pay'   THEN 'lwp_days'
  WHEN 'discipline'          THEN 'disciplinary_actions'
  WHEN 'discipline_action'   THEN 'disciplinary_actions'
  WHEN 'disciplinary'        THEN 'disciplinary_actions'
  WHEN 'disciplinary_action' THEN 'disciplinary_actions'
  WHEN 'training'            THEN 'training_compliance'
  WHEN 'training_program'    THEN 'training_compliance'
  WHEN 'training_programs'   THEN 'training_compliance'
END;