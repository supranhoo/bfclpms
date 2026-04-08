CREATE OR REPLACE FUNCTION public.sync_submission_on_kra_set()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'kra_set' AND OLD.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.review_submissions
    SET kpi_status = 'open',
        -- Preserve self_* fields so employee sees their original submission
        -- Clear manager fields
        manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
        manager_evidence_url = NULL, manager_evidence_urls = NULL,
        manager_achieved_value = NULL,
        -- Clear skip-level fields
        skip_level_rating = NULL, skip_level_score = NULL, skip_level_remarks = NULL,
        skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL,
        skip_level_achieved_value = NULL,
        -- Clear HR PMS fields
        hr_pms_rating = NULL, hr_pms_score = NULL, hr_pms_remarks = NULL,
        hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL,
        hr_pms_achieved_value = NULL,
        -- Clear auditor fields
        auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
        auditor_evidence_url = NULL, auditor_evidence_urls = NULL,
        auditor_achieved_value = NULL,
        -- Clear management fields
        management_rating = NULL, management_score = NULL, management_remarks = NULL,
        management_evidence_url = NULL, management_evidence_urls = NULL,
        management_achieved_value = NULL,
        -- Clear final scores
        final_rating = NULL, final_score = NULL,
        -- Reset NA flags
        is_na = false, na_marked_by_role = NULL,
        updated_at = now()
    WHERE kpi_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;