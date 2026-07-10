## Current state (what exists today)

Looking at the annual review module, here is what is **already possible** and what is **missing**:

| Need | Exists today? |
|---|---|
| Add a single employee to a cycle | Yes — Directory search → "Add to phase" (`create_or_get_annual_review_instance`) |
| Move an employee to a different template | Yes — per-employee override (`set_annual_review_template_override`) |
| Reassign a reviewer for an employee | Yes — `reassign_annual_review_reviewer` |
| **Remove an employee from a cycle** (keep them active in the system) | **No dedicated action** — the 37 annual-review RPCs have no delete/exclude endpoint |
| **Bulk add / remove / re-map a group of employees** | **No bulk UI** — everything is one-at-a-time |

So both of the user's asks are real gaps, not existing hidden features.

---

## What I'm proposing to build

### 1. Remove a single employee from Annual Review (keep them in the system)

Add an **"Exclude from this cycle"** action on the employee row in:
- Admin → Annual Review → Progress
- `/reports/annual-review`
- The employee directory search result (when an instance already exists)

Semantics (safe by design):
- Soft-exclude, not hard-delete. Add `excluded_at`, `excluded_by`, `excluded_reason` columns to `annual_review_instances` and a new `overall_status = 'excluded'`.
- Only allowed while the instance is in `not_started` or `pending_self` (same gate the reassignment flow uses). Past that point, we block with a clear message — the review has real data (self-review, manager notes) and deleting would destroy audit trail. For those, HR can only close the cycle or override the rating.
- Excluded instances are hidden from all reviewer queues, dashboards, reminders, and reports by default. A "Show excluded" toggle keeps them visible for audit.
- New RPC `exclude_annual_review_instance(instance_id, reason)` — HR/admin only, reason ≥ 3 chars, audit-logged as `annual_review.instance.excluded`.
- Reverse action: `restore_annual_review_instance(instance_id, reason)` puts it back to `not_started`.
- The employee's `profiles` row is **not touched** — they remain active everywhere else (KPIs, incentives, safety, etc.).

### 2. Group add / remove / re-map for Annual Review

Add an **"Annual Review — Bulk actions"** panel under Admin → Annual Review (new tab next to Progress). Employees can be selected three ways:
- Paste employee codes (one per line)
- Filter by BU / Department / Designation / Grade / Reporting Manager
- Upload a CSV with a single `employee_code` column

Three bulk actions on the selected set:

1. **Bulk add to cycle** — creates instances for anyone in the selection who doesn't have one yet. Uses the existing mapping rules to pick the template (same logic the seeder uses).
2. **Bulk remove from cycle** — calls `exclude_annual_review_instance` for each; skips (with reason) anyone past `pending_self` and shows a downloadable "skipped" report.
3. **Bulk re-map to a chosen template** — reuses the existing `SyncAssignmentsDialog` flow (`set_annual_review_template_override`), only eligible rows move, others are surfaced as "locked".

Every bulk run:
- Runs in a preview → confirm → execute pattern (dry-run count before writes)
- Is capped at 500 rows per submission and processed server-side in batches
- Writes one audit event per instance PLUS one `annual_review.bulk_action` summary row
- Produces a downloadable result CSV: `employee_code, action, status, reason`

### Technical section

- **Schema (migration):** add `excluded_at timestamptz`, `excluded_by uuid`, `excluded_reason text` to `annual_review_instances`; extend `overall_status` check to accept `'excluded'`. RLS policies updated so excluded rows are visible only to HR/admin unless "show excluded" is on.
- **New RPCs:** `exclude_annual_review_instance`, `restore_annual_review_instance`, `bulk_exclude_annual_review_instances(ids[], reason)`, `bulk_create_annual_review_instances(employee_ids[], cycle_id)`, `bulk_set_annual_review_template_override(ids[], template_id, reason)` — all SECURITY DEFINER, gated by `annual_review_directory_access` (HR/admin scope for global, BU-scope for BU heads/HODs, matching the existing directory access matrix).
- **Client:** new `AnnualReviewBulkActions.tsx` page + `annualReviewBulk.ts` service; row-level "Exclude" button on existing progress/report tables; a "Show excluded" toggle on the filter bar.
- **Tests:** RPC unit tests for gating (past-self blocked, non-HR blocked, BU-scope respected); service-layer tests for the batch splitter and skip-report shape; UI test for the confirm dialog on destructive bulk actions.
- **Docs:** update `docs/adr/ADR-annual-review.md` and `mem/features/annual-review/operations.md` with the exclude/restore lifecycle and the bulk-actions surface.

### Risk & impact

- **Data:** additive columns + one new status value; no destructive change; rollback = revert migration and hide the UI.
- **Workflow:** excluded rows are invisible to reviewers, so reminders and queues shrink correctly; no reviewer sees a broken link.
- **Regression:** the `pending_self`-only gate re-uses the same guard already used by reassignment and template override, so we don't invent a new safety rule.
- **Scale:** bulk capped at 500 per call, server-side batching in units of 50; matches existing bulk-review batch pattern.

### Out of scope (explicitly)

- Hard-deleting instances that already have manager/BU/HR responses. If HR truly needs that, they must reopen the cycle and use existing `rollback_annual_review_completed` first.
- Deactivating the employee's `profiles` row — that's the existing "Deactivate user" flow in Admin → Users and is a separate concern.

---

**Question before I build:** should the "Bulk remove" action be available to BU Heads / HODs within their BU scope, or restricted to HR/Admin only? (I'd recommend HR/Admin only for remove, and BU-scoped for add/re-map — safer default.)