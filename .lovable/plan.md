

## Add "Push to Next Level" on Pending Reviews + System-Forwarded Indicator

### Overview
Add a bulk action on the Pending Reviews admin page to push KPIs to the next workflow level without assigning a score. Also add a visual indicator on employee dashboards showing KPIs that were system-forwarded, and a dropdown to choose the target level.

### Part 1: Push Forward Mutation (`src/hooks/usePendingSelfReviews.ts`)

**New hook: `useBulkPushForward`**
- Accepts: `{ kpiIds, targetLevel, adminId }` where `targetLevel` is one of `'manager_check' | 'skip_level_check' | 'hr_pms_review' | 'audit' | 'management_review'`
- For each KPI:
  1. Update `kpis.status` to the target level
  2. Upsert `review_submissions` setting `auto_advance_reason` to e.g. `"System-forwarded to {targetLabel} (skipped {currentLevel} review)"`  — does NOT set any score fields
  3. Insert `kpi_audit_logs` with action `'SYSTEM_FORWARDED'`
- Invalidates relevant queries on success

### Part 2: UI on Pending Reviews Page (`src/pages/admin/PendingSelfReviews.tsx`)

**On each pending tab (Self-Review, Manager Review, Skip-Level):**
- Add a dropdown + button combo: `[Forward To: ▼ Manager / Skip Manager / Audit / Management] [Push Selected] [Push All]`
- The dropdown options are context-aware:
  - **Pending Self-Review** (status=`kra_set`): Forward to Manager (`self_review`), Skip Manager (`manager_check`), Audit, Management
  - **Pending Manager Review** (status=`self_review`): Forward to Skip Manager (`manager_check`), Audit, Management  
  - **Pending Skip-Level** (status=`manager_check`): Forward to Audit, Management
- Dropdown uses a `Select` component with state `forwardTarget`
- "Push Selected" and "Push All" buttons call `useBulkPushForward` with selected KPIs and chosen target

### Part 3: System-Forwarded Indicator on KPI Tables

**Files: `src/components/review/KpiDetailsTable.tsx`, `src/components/dashboard/MobileKpiCard.tsx`**
- Next to the existing `Zap` icon for auto-advance, add a `FastForward` (or `SkipForward`) icon from lucide-react for system-forwarded KPIs
- Condition: `submission?.auto_advance_reason?.startsWith('System-forwarded')`
- Icon: `FastForward` in blue/indigo color with tooltip showing the full reason
- This distinguishes system-forwarded (blue FastForward) from auto-scored-zero (orange Zap)

**File: `src/components/review/KpiJourneySection.tsx` and `src/components/review/ReviewTrailCard.tsx`**
- The existing auto-advance banner already renders for any `auto_advance_reason` — it will automatically show for system-forwarded KPIs too. Optionally differentiate the banner color (blue for forwarded vs orange for auto-scored).

### Part 4: Target Status Mapping

The forward target dropdown maps to actual KPI statuses:
| Dropdown Label | Target Status |
|---|---|
| Manager | `self_review` (manager sees it as pending) |
| Skip Manager | `manager_check` (skip-level sees it) |
| HR PMS | `skip_level_check` |
| Audit | `hr_pms_review` or status before audit |
| Management | `management_review` |

The exact target status will use `resolveForwardStatus` logic or direct mapping based on the employee's workflow stages.

### No database changes needed
The existing `auto_advance_reason` field on `review_submissions` and `kpi_audit_logs` table are sufficient.

