## Goal
Extend the existing **Comprehensive Annual Review Report** (`/reports/annual-review` → Comprehensive tab) with a single-row-per-employee **RCA view** that adds per-stage ratings, comments, HR-visibility diagnostics, and root-cause columns — then use it to answer the 101784 case.

## Scope confirmation before I code
The current Comprehensive tab already returns: employee master fields, per-stage scores, final score/rating, current stage, pending-with, days pending. It does **not** yet return per-stage `rating`, per-stage `comment`, or the HR-visibility diagnostic columns you listed. That's the actual delta.

## Risk & Impact
- **Data:** read-only. Extend one existing RPC (`get_annual_review_comprehensive_report`) to also return per-stage `rating` and `comment` from `annual_review_responses` (already the source of stage scores). No schema change, no writes.
- **RLS:** unchanged — RPC stays `SECURITY DEFINER` and scope resolver (`annual_review_directory_access`) is untouched, so who sees whom does not change.
- **UI:** additive columns in the same Comprehensive tab + a new **"RCA (single row)"** sub-view that shows all 30+ requested columns for one selected employee (default: search by code, e.g. `101784`).
- **Excel export:** the existing single-sheet "Employees" sheet gains the new columns; no new workbook, no new sheet — matches "single sheet / single table only".
- **Regression risk:** low. Additive columns only; existing consumers ignore new fields.
- **Scalability:** per-stage comments are already indexed by `(instance_id, reviewer_role)` in `annual_review_responses`; one extra join, no row explosion.
- **Rollback:** revert one RPC + one component file.

## Deliverables

### 1. RPC change — `get_annual_review_comprehensive_report`
Add to the returned row:
- `self_rating`, `self_comment`
- `manager_rating`, `manager_comment`
- `dept_head_rating`, `dept_head_comment` (HOD)
- `bu_head_rating`, `bu_head_comment`
- `hr_rating`, `hr_comment`
- `hr_stage_enabled` (bool — from cycle's `default_enabled_stages` ∪ instance overrides)
- `hr_response_exists` (bool — a row in `annual_review_responses` for role=`hr`)
- `hr_response_submitted_at` (timestamptz | null)

### 2. Derived diagnostics (client-side, pure fn)
Given the row, compute:
- **HR Data Available** = `hr_response_exists`
- **HR Data Visible in Report** = `hr_response_exists && hr_score IS NOT NULL` (visibility here = report can render it; the RPC is SECURITY DEFINER so RLS is not the blocker)
- **Root Cause for missing HR** (single value from the exact list you gave):
  - stage not in enabled_stages → **HR Review Not Started** (workflow hasn't reached HR)
  - enabled, `overall_status = 'pending_hr'`, no response row → **HR Review Pending**
  - response row exists, `submitted_at` null → **HR Review Not Submitted**
  - `hr_id IS NULL` on instance → **HR Data Not Mapped**
  - `hr_response_exists && hr_score IS NULL` → **Data Migration Issue** (score column not backfilled — matches ADR-106 pattern)
  - all above pass but UI still blank → **Report Configuration Issue** (column-mapping fallback)
- **Evidence** = short string with the exact field values that drove the diagnosis (e.g. `enabled_stages=[self,manager,bu]; hr_id=null`).
- **Impact** = fixed strings tied to the root cause (e.g. "HR score excluded from final calc" or "Final rating cannot be computed").
- **Recommended Fix** = fixed strings per root cause (e.g. "Enable HR stage on cycle X" / "Assign HR reviewer on instance" / "Run backfill RPC").

Regression test file: `src/services/annualReview/comprehensiveReportRca.test.ts` — 8 cases, one per root-cause branch, plus the "all green" happy path.

### 3. UI — Comprehensive tab
- **New "RCA — single employee" section at top of the tab.** Input: employee code or name. Renders **one horizontal table row** with every column you listed (33 columns), horizontally scrollable. This is the "single sheet / single table" view you asked for.
- The existing employees table keeps its current shape; the new stage-rating / stage-comment columns become optional toggles (off by default) to avoid overwhelming the default view.

### 4. Excel export
Single sheet "Employees" gains the new columns in this exact order after existing ones:
`Self Rating, Self Comment, HOD Rating, HOD Comment, BU Head Rating, BU Head Comment, HR Rating, HR Comment, HR Data Available, HR Data Visible, Root Cause, Evidence, Impact, Recommended Fix`.
Sort remains **Department → Business Unit → Employee Name** (already in place).

### 5. 101784 answer (runs after code lands)
Once the RPC returns the new fields, I'll query the row for employee `101784` in the current active cycle and report:
- Master fields (code, name, designation, dept, BU, division, grade, DOJ, eligibility)
- Per-stage score / rating / comment for Self, HOD, BU Head, HR
- Final score & rating, current stage, pending with, days since update
- HR Data Available, HR Data Visible, and the single Root Cause + Evidence + Impact + Recommended Fix

If HR is blank, the diagnostic function above will pick exactly one of your 8 listed reasons — no guessing.

## What I will NOT touch
- Notification guard, RLS on `annual_review_instances`, scoring math, write paths.
- Existing By-Department / Reviewer-Queues / Drilldown tabs.
- No new workbook / no multi-sheet export — you asked for a single table, so the export stays single-sheet.

## Open question before I build
For **"HR Comment"** the schema exposes both a private HR note (`review_action_notes`, HR-only) and the reviewer's `comment` on `annual_review_responses` (visible to the employee at completion). The report should show the latter — the on-record reviewer comment, not the private HR note — to stay consistent with what the employee sees. Say "use private notes" if you want the HR-only note instead; default is the on-record comment.
