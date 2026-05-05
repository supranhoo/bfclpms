
-- 1. Delete the 7 duplicate (literal-\n) OKV rows; their LF counterparts already exist with equal-or-better status
DELETE FROM public.org_kpi_values
 WHERE id IN (
   '0e483e0e-3ab0-4191-b74f-02ba16f0baf9'::uuid,
   'e696f81f-b2b8-450b-9048-6ce03edeeefe'::uuid,
   'dce33d29-c421-4cc2-88b2-831fcf0b3928'::uuid,
   'fd43099e-f5d2-462e-82fb-4b274e634283'::uuid,
   'f8987be2-13a9-4264-928c-95c15684824d'::uuid,
   '718d3fb9-af1a-4113-9002-23a34a8f93e5'::uuid,
   'da419c8d-b207-493b-b0c5-01250e60cfd3'::uuid
 );

-- 2. Renormalize (literal "\n" -> real LF, plus any remaining CRLF)
ALTER TABLE public.kpis DISABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values DISABLE TRIGGER USER;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER trg_normalize_kpi_text;

UPDATE public.kpis
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE position(E'\\n' in kpi_name) > 0
    OR position(E'\\n' in kra_name) > 0
    OR position(chr(13) in kpi_name) > 0
    OR position(chr(13) in kra_name) > 0;

UPDATE public.org_kpi_values
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE position(E'\\n' in kpi_name) > 0
    OR position(E'\\n' in kra_name) > 0
    OR position(chr(13) in kpi_name) > 0
    OR position(chr(13) in kra_name) > 0;

ALTER TABLE public.kpis ENABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER USER;

-- 3. Backfill the two affected April 2026 review_submissions
ALTER TABLE public.kpis DISABLE TRIGGER check_period_lock_on_kpi_update;

WITH targets AS (
  SELECT k.id AS kpi_id, k.employee_id, k.review_period, k.review_year, k.category_id, k.kra_name, k.kpi_name
  FROM public.kpis k
  WHERE k.id IN ('cc74b931-6481-43b3-80cf-4fbd6eff95be'::uuid, '73e51681-b052-4348-8594-b937fae8d857'::uuid)
),
matched AS (
  SELECT t.kpi_id, okv.achieved_value, okv.is_na, okv.evidence_url, okv.evidence_urls, okv.remarks
  FROM targets t
  JOIN public.org_kpi_values okv
    ON okv.category_id = t.category_id
   AND okv.kra_name = t.kra_name
   AND okv.kpi_name = t.kpi_name
   AND okv.review_period = t.review_period
   AND okv.review_year = t.review_year
   AND okv.employee_id = t.employee_id
   AND okv.status IN ('propagated','approved')
),
scored AS (
  SELECT m.*,
         (SELECT score FROM public.compute_org_kpi_score_for_kpi(m.kpi_id, m.achieved_value)) AS score,
         (SELECT rating FROM public.compute_org_kpi_score_for_kpi(m.kpi_id, m.achieved_value)) AS rating
  FROM matched m
)
INSERT INTO public.review_submissions
  (kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
   self_evidence_url, self_evidence_urls, self_remarks, submitted_at, updated_at)
SELECT s.kpi_id,
       CASE WHEN s.is_na THEN NULL ELSE s.achieved_value END,
       CASE WHEN s.is_na THEN NULL ELSE s.score END,
       CASE WHEN s.is_na OR s.rating IS NULL THEN NULL ELSE s.rating::rating_level END,
       COALESCE(s.is_na,false),
       CASE WHEN s.is_na THEN 'admin' ELSE NULL END,
       s.evidence_url, s.evidence_urls, s.remarks,
       now(), now()
FROM scored s
ON CONFLICT (kpi_id) DO NOTHING;

ALTER TABLE public.kpis ENABLE TRIGGER check_period_lock_on_kpi_update;
