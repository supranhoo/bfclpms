
CREATE OR REPLACE FUNCTION public.sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.review_submissions
    SET kpi_status = 'open',
        self_rating = NULL, self_score = NULL, self_remarks = NULL,
        self_evidence_url = NULL, self_evidence_urls = NULL,
        achieved_value = NULL,
        manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
        manager_evidence_url = NULL, manager_evidence_urls = NULL,
        manager_achieved_value = NULL,
        skip_level_rating = NULL, skip_level_score = NULL, skip_level_remarks = NULL,
        skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL,
        skip_level_achieved_value = NULL,
        hr_pms_rating = NULL, hr_pms_score = NULL, hr_pms_remarks = NULL,
        hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL,
        hr_pms_achieved_value = NULL,
        auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
        auditor_evidence_url = NULL, auditor_evidence_urls = NULL,
        auditor_achieved_value = NULL,
        management_rating = NULL, management_score = NULL, management_remarks = NULL,
        management_evidence_url = NULL, management_evidence_urls = NULL,
        management_achieved_value = NULL,
        final_rating = NULL, final_score = NULL,
        is_na = false, na_marked_by_role = NULL,
        updated_at = now()
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$
LANGUAGE plpgsql;
