
ALTER TABLE org_kpi_values
  DROP CONSTRAINT org_kpi_values_category_id_kra_name_kpi_name_review_period__key;

CREATE UNIQUE INDEX org_kpi_values_scoped_unique
  ON org_kpi_values (
    category_id, kra_name, kpi_name, review_period, review_year,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
