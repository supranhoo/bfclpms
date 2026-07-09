create policy "Observation evidence readable by KPI participants"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'review-evidence'
    and (storage.foldername(name))[3] = 'observation-evidence'
    and exists (
      select 1
      from public.kpis k
      left join public.profiles emp on emp.id = k.employee_id
      left join public.profiles mgr on mgr.id = emp.reporting_manager_id
      where k.id::text = (storage.foldername(objects.name))[2]
        and (
          k.employee_id = auth.uid()
          or emp.reporting_manager_id = auth.uid()
          or mgr.reporting_manager_id = auth.uid()
          or exists (
            select 1 from public.audit_kpi_assignments a
            where a.employee_id = k.employee_id and a.auditor_id = auth.uid()
          )
          or exists (
            select 1 from public.audit_kpi_level_assignments la
            where la.kpi_id = k.id and la.auditor_id = auth.uid()
          )
          or exists (
            select 1 from public.kpi_mention_access m
            where m.kpi_id = k.id and m.user_id = auth.uid()
          )
        )
    )
  );