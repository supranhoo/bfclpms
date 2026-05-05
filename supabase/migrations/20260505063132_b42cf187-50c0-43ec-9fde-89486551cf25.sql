
CREATE OR REPLACE FUNCTION public.normalize_kpi_text_value(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE WHEN txt IS NULL THEN NULL
    ELSE rtrim(
           replace(
             replace(
               replace(txt, chr(13)||chr(10), chr(10)),
               chr(13), chr(10)
             ),
             chr(92)||'n', chr(10)
           )
         )
  END
$fn$;

ALTER TABLE public.kpis DISABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values DISABLE TRIGGER USER;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER trg_normalize_kpi_text;

UPDATE public.kpis
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE position(chr(92)||'n' in kpi_name) > 0
    OR position(chr(92)||'n' in kra_name) > 0
    OR position(chr(13) in kpi_name) > 0
    OR position(chr(13) in kra_name) > 0;

UPDATE public.org_kpi_values
   SET kpi_name = public.normalize_kpi_text_value(kpi_name),
       kra_name = public.normalize_kpi_text_value(kra_name)
 WHERE position(chr(92)||'n' in kpi_name) > 0
    OR position(chr(92)||'n' in kra_name) > 0
    OR position(chr(13) in kpi_name) > 0
    OR position(chr(13) in kra_name) > 0;

ALTER TABLE public.kpis ENABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.org_kpi_values ENABLE TRIGGER USER;

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
