

## Fix: KPI Journey Report Action Name Mapping

### Problem
The `ACTION_MAP` in `useKpiJourneyReport.ts` uses action names that don't exist in the database. The actual audit log uses different action names and a `STATUS_TRANSITION` pattern with `old_value`/`new_value` JSON fields.

### Actual DB Action Names (from `kpi_audit_logs`)

| DB Action | Count | Maps to |
|-----------|-------|---------|
| `STATUS_TRANSITION` (new_value.status = `self_review`) | ~8395 total | `selfSubmittedAt` (transition from kra_set → self_review) |
| `MANAGER_FORWARDED` | 1957 | `managerActionAt` |
| `MANAGER_SENT_BACK_TO_EMPLOYEE` | 200 | `managerActionAt` |
| `SKIP_LEVEL_FORWARDED` | 526 | `skipLevelAt` |
| `SKIP_LEVEL_SENT_BACK_TO_MANAGER/EMPLOYEE` | 45 | `skipLevelAt` |
| `HR_PMS_FORWARDED` | 879 | `hrPmsAt` |
| `HR_PMS_SENT_BACK_TO_*` | 42 | `hrPmsAt` |
| `AUDITOR_FORWARDED` | 471 | `auditorAt` |
| `AUDITOR_SENT_BACK_TO_*` | 88 | `auditorAt` |
| `MANAGEMENT_APPROVED` | 318 | `managementAt` |
| `MANAGEMENT_SENT_BACK_TO_*` | 36 | `managementAt` |
| `STATUS_TRANSITION` (new_value.status = `approved`) | — | `finalApprovedAt` |

The `kraAssignedAt` can fall back to `kpi.created_at` (already done). For `selfSubmittedAt`, the best signal is `STATUS_TRANSITION` where `old_value.status = 'kra_set'` and `new_value.status = 'self_review'`.

### Changes

**File: `src/hooks/useKpiJourneyReport.ts`**

1. **Update `ACTION_MAP`** to use real DB action names:
   - `MANAGER_FORWARDED` / `MANAGER_SENT_BACK_TO_EMPLOYEE` → `managerActionAt`
   - `SKIP_LEVEL_FORWARDED` / `SKIP_LEVEL_SENT_BACK_TO_*` → `skipLevelAt`
   - `HR_PMS_FORWARDED` / `HR_PMS_SENT_BACK_TO_*` → `hrPmsAt`
   - `AUDITOR_FORWARDED` / `AUDITOR_SENT_BACK_TO_*` → `auditorAt`
   - `MANAGEMENT_APPROVED` / `MANAGEMENT_SENT_BACK_TO_*` → `managementAt`

2. **Handle `STATUS_TRANSITION` specially** in the timeline-building loop:
   - Parse `new_value->>'status'` from the log's `new_value` JSON
   - `kra_set → self_review` transition → `selfSubmittedAt`
   - `→ approved` transition → `finalApprovedAt`

3. **Fetch `new_value` column** alongside `action` and `created_at` in the audit log query (add `new_value` to the select).

No other files need changes. The report page and route are already wired up correctly.

