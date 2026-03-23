

## Completed: Fix missing notification coverage for skip_level_check and hr_pms_review → approved

The `notify_on_kpi_status_change` trigger's CASE 5 now covers all 7 possible preceding statuses before `approved`: `kra_set`, `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`. This ensures KPI finalized emails are sent regardless of workflow configuration.
