---
name: Change History Capture Completeness
description: Profile field auditing runs through one bound trigger; manager/dept/designation changes recorded from 31 Jul 2026 and shown as "Reporting & Org"
type: feature
---
ADR-215 / POLICY §CHG-HISTORY-CAPTURE-COMPLETENESS.

- Single capture path: `trg_profiles_field_audit AFTER UPDATE ON public.profiles` → `public.log_profile_identity_change()`, which writes one `profile.field_changed` audit row per changed field from a 21-field list. To audit a new field, add it to that function's list — never add a parallel trigger.
- Creating an audit function without binding its trigger is an incomplete change (this exact gap made every reporting-manager change invisible from ADR-213 until ADR-215). Always verify the trigger is bound after such a migration.
- `reporting_manager_id`, `functional_manager_id`, `department_id`, `designation` → category `reporting_org` ("Reporting & Org"). Client `categoryForField` and the RPC's category CASE are mirrors — change together.
- Foreign-key values resolve to names via `public.resolve_change_value`; never display raw ids.
- Capture for these fields starts 31 Jul 2026; earlier changes were never stored. The report states this so an empty range isn't read as "no changes".
- Report exports page until a short page is returned. `CHANGE_HISTORY_EXPORT_CAP` (100k) is a runaway guard, not a business cap.
