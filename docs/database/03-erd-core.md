# 03 — Core ERD (Org + Monthly PMS)

```text
companies
   |
   +-- divisions
   |        |
   |        +-- business_units ----+-- business_unit_sub_units
   |                   |
   |                   +-- departments ----+-- designations
   |                              |
   |                              v
   |                          profiles  (employee spine)
   +------------------------------+   id, manager_id, functional_manager_id,
                                      department_id, company_id, is_active
                                          |
        +---------------------------------+----------------------------+
        |                    |                        |                |
        v                    v                        v                v
    user_roles          kpis (19.5k)          org_kpi_data_owners   workflow_config
  (role per row;      employee_id,            (org KPI ownership)   (employee ->
   never on profiles) category_id -> kra_categories                  workflow_template)
                            |
                            v
                    review_submissions  (67 cols, one row per KPI x period)
                     self_* | manager_* | functional_manager_* | skip_level_*
                     hr_pms_* | audit_* | management_* | final_score
                            |
        +-------------------+--------------------+------------------+
        v                   v                    v                  v
 sub_period_submissions  kpi_audit_logs     kpi_queries       kpi_observations
 (daily/weekly rollup)   (immutable trail)  (+ replies)       (+ replies)
```

**Cardinality notes**

- `profiles 1..* kpis` — KPI uniqueness is enforced on `(employee_id, kra_name, kpi_name, period)`.
- `kpis 1..1 review_submissions` per review period; the submission row is created lazily on first stage write.
- `workflow_config` resolves the *ordered stage list* per employee per period. Stage arrays must never be hardcoded in reports — resolve via `get_bulk_employee_workflows()` / `get_employee_workflow()`.
- `final_score` on `review_submissions` is immutable once the terminal stage approves; changes are journaled in `final_score_revisions`.
