
# Make Workflow Config period-only, migrate globals safely, align User forms

Three related changes. Planning only — no schema or code changes until you approve.

---

## Migration RCA — what the database actually has

Verified live counts on `public.workflow_config`:

| Slice | Count |
|---|---|
| Total mappings | 359 |
| Period-specific (`review_period IS NOT NULL`) | 286 |
| Global defaults (`review_period IS NULL`) | **73** |
| Globals that already have ≥1 period-specific row for the same `(config_type, config_value)` | 35 |
| Distinct `config_type` values in use | `employee` only (0 dept, 0 pms_grade) |

Per-employee fan-out for the 73 globals: each affected employee has KPIs across **10–13 distinct `(review_period, review_year)`** combinations in `kpis`. Expected migration insert volume = **≈ 500–700 new period-specific rows** (after deducting the 35 employees who already have partial coverage).

Schema already supports the target state cleanly:

- Partial unique index `workflow_config_period_unique` on `(config_type, config_value, review_period, review_year) WHERE review_period IS NOT NULL` → `ON CONFLICT DO NOTHING` will protect every existing period mapping.
- Partial unique index `workflow_config_global_unique` lets globals remain as fallback rows if we choose not to delete.

**Critical safety signal — two triggers fire on every write to `workflow_config`:**
1. `trg_repercolate_on_workflow_config_change` → re-percolates workflow into KPIs.
2. `trg_workflow_change_step_back` → can regress KPI statuses when the resolved workflow changes.

If we bulk-insert period rows that resolve to the **same** `workflow_template_id` as the global the employee was already using, the resolved workflow per KPI is unchanged → step-back is a no-op. We must verify this invariant per row before insert. Any row where the new period-specific template would differ from the previously-resolved one is **excluded from the auto-migration** and surfaced in a review list for the admin to handle manually.

---

## Risk & Impact Report

- **Data Impact**: Inserts into `workflow_config` only (no UPDATE/DELETE). Globals are retained as internal fallback. Idempotent via partial unique index.
- **Workflow Impact**: Resolution order becomes period-scoped first; existing period rows untouched, so per-period resolution outcome is identical.
- **UI/UX Impact**: Scope dropdown loses "Global Default". Edit User Workflow card gains a Review Period selector. Add New User form expands to match Edit User. Mandatory indicator stays as red lowercase `l` (no asterisk).
- **Regression Risk**: Highest-risk surface = the two `workflow_config` triggers. Mitigated by "same template" pre-check and dry-run preview.
- **Scalability Impact**: ≤ 700 rows inserted inside a single transaction; trivial.
- **Mitigation**: Dry-run preview before commit · per-row "would change resolved template?" guard · `ON CONFLICT DO NOTHING` · auditability metadata (`metadata->>'source' = 'global_default_migration_2026_<run_id>'`, `created_by = current admin`) · single-statement rollback by `run_id`.

---

## Part 1 — Workflow Config: period-only with safe migration

### 1a. New admin tool: "Convert Global Defaults to Period-Specific"

A modal launched from System Settings → Workflow Config. Flow:

```text
Step 1 — Dry-run analysis  (no writes)
   • Lists 73 global mappings.
   • For each, computes the set of (review_period, review_year) the employee/dept/grade
     has KPIs assigned to (using kpis.review_period + kpis.review_year — the KRA
     assigned month rule you specified).
   • Splits into 4 buckets:
       A. Will create period-specific row (no existing period mapping, resolved template
          stays the same → safe to auto-migrate).
       B. Skipped — period-specific mapping already exists for that period.
       C. Manual review needed — auto-migration would change the resolved template
          for at least one KPI (different template assigned at a more-specific level).
       D. Orphan globals — no KPIs found in any period for this scope (kept as
          fallback, not migrated).
   • Renders summary + per-row drill-down + CSV export.

Step 2 — Admin confirms  (writes inside single TX)
   • INSERT … SELECT into workflow_config from bucket A only.
   • ON CONFLICT (workflow_config_period_unique) DO NOTHING.
   • metadata column not present → we attach provenance through created_by + a new
     workflow_config_migration_log table (see below) so the audit trail is durable.
   • Globals are NOT deleted. They become internal fallback only.

Step 3 — Verification asserts inside same TX
   • Pre/post resolved-template diff = 0 for every (employee_id, period) touched.
   • Period-row count delta == bucket A size.
   • Trigger step-back side-effects: count of kpis with status regression == 0.
   • COMMIT or ROLLBACK.
```

### 1b. New table `workflow_config_migration_log` (audit trail)

Tiny append-only table: `id, run_id, source_config_id (FK global row), created_period_config_id (FK new row), employee_id, review_period, review_year, resolved_template_id, performed_by, performed_at`. Powers rollback and post-run audit.

Rollback (single statement):
```sql
DELETE FROM workflow_config
 WHERE id IN (SELECT created_period_config_id
                FROM workflow_config_migration_log
               WHERE run_id = '<uuid>');
```

### 1c. UI changes to `WorkflowConfig.tsx`

- Remove "Global Default" option from the Scope dropdown.
- Force "Specific Period" + require a Review Period to be selected before any new mapping can be saved or edited.
- Add a non-dismissible banner above the grid: **"Workflows are resolved for the selected review period in this order: Employee > Department > PMS Grade > Period Default."**
- "Period Default" replaces "Global Default" everywhere in copy.
- Existing global rows remain visible in a **read-only "Legacy fallback" tab** (renamed from any current global view) so admins can still see what fallback exists. No create/edit on this tab.
- "Convert Global Defaults to Period-Specific" CTA opens the dry-run modal from §1a. CTA hides automatically when `count(global rows) == 0`.

### 1d. Backend resolver behavior (unchanged for backward compatibility)

The existing per-employee workflow resolver (`mem://architecture/database/per-employee-workflow-resolution`) already prefers period-specific over global. Leaving the global fallback path intact preserves any historical edge case the migration leaves behind. After admin runs the migration and verifies counts, an optional second migration (separately approved) can null-out remaining globals.

---

## Part 2 — Edit User: period-scoped workflow mapping

Location: `Admin > User Management > Edit User > Access & Login > Workflow mapping`.

Changes (presentation + small write-path adjustment, no resolver changes):

- New **Review Period selector** (re-uses `ReviewPeriodSelector` from `src/components/ui/ReviewPeriodSelector.tsx`).
- Helper text: **"Workflow mapping is period-specific. Select a review period before assigning workflow."**
- "Assigned Workflow" dropdown is disabled until a period is selected.
- On period change → fetch existing `workflow_config` row for `(config_type='employee', config_value=user.id, review_period, review_year)` and pre-fill the dropdown.
- Save writes `INSERT … ON CONFLICT (workflow_config_period_unique) DO UPDATE SET workflow_template_id = EXCLUDED.workflow_template_id, updated_at = now(), created_by = auth.uid()`.
- "Reset to Period Default" button clears **only** the selected period's row (`DELETE WHERE config_type='employee' AND config_value=user.id AND review_period=… AND review_year=…`). Other periods untouched.
- Save blocked (toast: "Select a review period first") when period is empty — your acceptance criterion.
- No global write path exposed in this UI.

---

## Part 3 — Align Add New User and Edit User fields

### 3a. Field parity matrix (target)

| Tab | Field | Source today | After |
|---|---|---|---|
| Profile | Full Name | Both | Both |
| Profile | Email | Both | Both |
| Profile | Employee Code | Both | Both |
| Profile | Mobile Number | Edit only | **Both** |
| Profile | Group DOJ (GDOJ) | Edit only | **Both** |
| Profile | DOJ | Both | Both |
| Profile | Confirmation Date | Edit only | **Both** |
| Profile | Company | Both | Both |
| Profile | Division | Both | Both |
| Profile | Department | Both | Both |
| Profile | Designation | Both | Both |
| Profile | PMS Grade | Both | Both |
| Profile | Employee Category | Both | Both |
| Profile | Employment Status | Edit only | **Both** |
| Profile | Location | Both | Both |
| Profile | Reporting Manager | Both | Both |
| Access | Role | Both | Both |
| Access | Portal Access | Both | Both |
| Access | Account Status | Edit only | **Add only where applicable** (new users default to Active) |
| Access | Dummy/system employee | Add only | **Both** |
| Access | Grant module roles | Edit only | **Both** |
| Access | Send/reset password | Edit only | Edit only (N/A on create) |
| Access | View access history | Edit only | Edit only (N/A on create) |
| Access | Workflow mapping + Period selector + Assigned Workflow | Edit only (period selector new in §2) | **Both** (optional on Add) |

(Exact "today" mapping will be reconfirmed against `AddUserDialog` and `EditUserDialog` during build; the above is from the field list you provided.)

### 3b. Add New User behavior

- Workflow card is optional on create. Validation rule: **"Save workflow mapping only if BOTH period and assigned workflow are selected."** Either both or neither — never one-sided.
- User creation does **not** fail if workflow card is blank.
- All other mandatory rules continue to come from `system_settings.employee_master_field_requirements` (already SSOT per `src/lib/employeeMasterFields.ts`). No new mandatory rules introduced here.

### 3c. Edit User behavior

- All field updates remain safe and additive.
- Workflow card writes are period-scoped per §2.
- Send/reset password and access history remain where they are.

### 3d. Mandatory indicator

- Continue using the existing red lowercase `l` indicator from the current form.
- No asterisks anywhere.
- Same indicator applied uniformly on both Add and Edit for the newly added fields.

---

## Implementation Plan (phased)

**Phase 1 — Migration tool (read-only)**
- Build dry-run analyzer + 4-bucket preview + CSV export.
- Add `workflow_config_migration_log` table (CREATE + GRANT + RLS + admin-only policies + service_role).
- Zero writes to `workflow_config`. Ship behind admin-only route.

**Phase 2 — Apply migration**
- Admin runs migration from the dry-run modal; single TX with verification asserts.
- Post-run report shown in UI; downloadable.

**Phase 3 — Workflow Config UI lockdown**
- Remove "Global Default" from Scope dropdown.
- Read-only "Legacy fallback" tab for residual globals.
- Update banner copy to "Period Default".
- Disable save until period selected.

**Phase 4 — Edit User period-scoped workflow card**
- Add `ReviewPeriodSelector` to the card.
- Period-scoped read/write/reset.

**Phase 5 — Field parity (Add ↔ Edit)**
- Bring missing fields into Add New User; bring missing fields into Edit User where applicable.
- Reuse same field components; mandatory driven by SSOT.
- Add optional Workflow card to Add New User with the both-or-neither rule.

Each phase ends with: regression tests (extend `bugBountyFixes.test.ts`), DOCUMENTATION.md Version History entry, POLICY.md section append, CHANGELOG_2026.md row, and a rollback note.

---

## Tests (mandatory deliverables)

- `workflowConfigMigration.test.ts` — bucket classifier (A/B/C/D) on fixture data.
- `workflowConfigMigration.idempotency.test.ts` — second run inserts 0 rows.
- `workflowConfigMigration.stepBack.test.ts` — asserts 0 KPI status regressions for bucket A.
- `editUserWorkflowPeriod.test.ts` — period selector required; reset affects only selected period.
- `userFormParity.test.ts` — snapshot that Add and Edit expose the same field keys (minus N/A items).

---

## Out of scope (explicitly will NOT happen)

- No deletion of global rows in this run (kept as fallback per your constraint).
- No change to the per-employee resolver function.
- No change to KPI scoring, formulas, or `kpi_audit_logs` vocabulary.
- No change to workflow templates themselves.
- No change to role/permission logic beyond surfacing the missing aligned fields.
- No global workflow mapping creation path remains exposed in UI (Add User, Edit User, or Workflow Config).

---

## Decisions needed before Phase 1 build

1. **Bucket C handling**: Confirm — surface for manual admin action only (recommended), or attempt auto-migration with explicit warning?
2. **Legacy fallback tab visibility**: Show to all admins, or hide entirely once `count(global) == 0`?
3. **Workflow on Add New User**: Single period at create time only (recommended), or allow multiple period rows in one go?
4. **Globals deletion**: After successful migration + 1 cycle of stable operation, do you want a separate approved migration to null/delete remaining globals, or keep them indefinitely as silent fallback?

Once confirmed, I'll proceed phase-by-phase, each gated by your approval.
