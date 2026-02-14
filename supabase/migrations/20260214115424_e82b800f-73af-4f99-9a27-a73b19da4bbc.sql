
-- Function to auto-generate KPI templates and bundles from existing KPI data
CREATE OR REPLACE FUNCTION public.generate_bundles_from_kpis()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_templates_created INTEGER := 0;
  v_bundles_created INTEGER := 0;
  v_links_created INTEGER := 0;
  v_dept_desig RECORD;
  v_kpi RECORD;
  v_template_id UUID;
  v_bundle_id UUID;
  v_sort_order INTEGER;
BEGIN
  -- Step 1: For each unique department+designation combo
  FOR v_dept_desig IN
    SELECT DISTINCT p.department_id, p.designation, d.name as dept_name
    FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
    LEFT JOIN departments d ON d.id = p.department_id
    WHERE p.department_id IS NOT NULL AND p.designation IS NOT NULL
    ORDER BY d.name, p.designation
  LOOP
    -- Check if bundle already exists for this dept+designation
    SELECT id INTO v_bundle_id
    FROM template_bundles
    WHERE department_id = v_dept_desig.department_id
      AND designation = v_dept_desig.designation
    LIMIT 1;

    -- Skip if bundle already exists
    IF v_bundle_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Create the bundle
    INSERT INTO template_bundles (name, department_id, designation, is_active)
    VALUES (
      LEFT(COALESCE(v_dept_desig.dept_name, 'Unknown') || ' - ' || v_dept_desig.designation, 200),
      v_dept_desig.department_id,
      v_dept_desig.designation,
      true
    )
    RETURNING id INTO v_bundle_id;
    v_bundles_created := v_bundles_created + 1;

    -- Step 2: Create templates for unique KPIs in this dept+designation
    v_sort_order := 0;
    FOR v_kpi IN
      SELECT DISTINCT ON (k.kra_name, k.kpi_name)
        k.kra_name, k.kpi_name, k.category_id,
        k.uom, k.target_value, k.weightage, k.criteria, k.frequency,
        k.source_of_data, k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
        k.uom_type, k.qualitative_options, k.threshold_mode
      FROM kpis k
      JOIN profiles p ON p.id = k.employee_id
      WHERE p.department_id = v_dept_desig.department_id
        AND p.designation = v_dept_desig.designation
      ORDER BY k.kra_name, k.kpi_name, k.created_at
    LOOP
      -- Check if template already exists with same kra_name, kpi_name, category_id
      SELECT id INTO v_template_id
      FROM kpi_templates
      WHERE kra_name = v_kpi.kra_name
        AND kpi_name = v_kpi.kpi_name
        AND category_id = v_kpi.category_id
      LIMIT 1;

      -- Create template if it doesn't exist
      IF v_template_id IS NULL THEN
        INSERT INTO kpi_templates (
          title, kra_name, kpi_name, category_id,
          uom, target_value, weightage, criteria, frequency,
          source_of_data, r5, r4, r3, r2, r1, r0,
          uom_type, qualitative_options, threshold_mode,
          is_active
        )
        VALUES (
          LEFT(v_kpi.kra_name || ' - ' || v_kpi.kpi_name, 255),
          v_kpi.kra_name, v_kpi.kpi_name, v_kpi.category_id,
          v_kpi.uom, v_kpi.target_value, v_kpi.weightage, v_kpi.criteria, v_kpi.frequency,
          v_kpi.source_of_data, v_kpi.r5, v_kpi.r4, v_kpi.r3, v_kpi.r2, v_kpi.r1, v_kpi.r0,
          v_kpi.uom_type, v_kpi.qualitative_options, v_kpi.threshold_mode,
          true
        )
        RETURNING id INTO v_template_id;
        v_templates_created := v_templates_created + 1;
      END IF;

      -- Step 3: Link template to bundle
      INSERT INTO template_bundle_items (bundle_id, template_id, sort_order)
      VALUES (v_bundle_id, v_template_id, v_sort_order)
      ON CONFLICT DO NOTHING;
      v_sort_order := v_sort_order + 1;
      v_links_created := v_links_created + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'templates_created', v_templates_created,
    'bundles_created', v_bundles_created,
    'links_created', v_links_created
  );
END;
$$;
