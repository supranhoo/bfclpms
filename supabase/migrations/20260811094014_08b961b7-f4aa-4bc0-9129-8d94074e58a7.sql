CREATE OR REPLACE FUNCTION public.tni_qualified_kpis(p_periods jsonb, p_threshold numeric, p_min_scored_months integer DEFAULT 1)
 RETURNS TABLE(employee_id uuid, kpi_key text, kra_name text, kpi_name text, months jsonb, scored_months integer, worst_score numeric, latest_score numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with periods as (
    select (e->>'month')::text as review_period,
           (e->>'year')::int   as review_year,
           t.ordinality        as ord
    from jsonb_array_elements(coalesce(p_periods, '[]'::jsonb)) with ordinality as t(e, ordinality)
  ),
  scored as (
    select k.employee_id,
           lower(btrim(coalesce(k.kra_name,''))) || '||' || lower(btrim(coalesce(k.kpi_name,''))) as kpi_key,
           k.kra_name,
           k.kpi_name,
           k.review_period,
           k.review_year,
           p.ord,
           coalesce(
             rs.final_score,
             rs.management_score,
             rs.hr_pms_score,
             rs.skip_level_score,
             rs.auditor_score,
             rs.functional_manager_score,
             rs.manager_score,
             rs.self_score
           ) as eff_score
    from periods p
    join public.kpis k
      on k.review_period = p.review_period
     and k.review_year = p.review_year
    join public.review_submissions rs
      on rs.kpi_id = k.id
    where coalesce(rs.is_na, false) = false
      and coalesce(
            rs.final_score,
            rs.management_score,
            rs.hr_pms_score,
            rs.skip_level_score,
            rs.auditor_score,
            rs.functional_manager_score,
            rs.manager_score,
            rs.self_score
          ) is not null
      and k.employee_id is not null
  )
  select s.employee_id,
         s.kpi_key,
         (array_agg(s.kra_name order by s.ord desc))[1] as kra_name,
         (array_agg(s.kpi_name order by s.ord desc))[1] as kpi_name,
         jsonb_agg(jsonb_build_object('month', s.review_period, 'year', s.review_year, 'score', s.eff_score) order by s.ord) as months,
         count(*)::int as scored_months,
         min(s.eff_score) as worst_score,
         (array_agg(s.eff_score order by s.ord desc))[1] as latest_score
  from scored s
  group by s.employee_id, s.kpi_key
  having bool_and(s.eff_score <= p_threshold)
     and count(*) >= greatest(1, coalesce(p_min_scored_months, 1))
$function$;