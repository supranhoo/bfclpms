

## Plan: System-Wide Delete Reconfirmation Sweep

### RCA
The [Destructive Action Governance](mem://design/destructive-action-governance) policy mandates `ConfirmDestructiveDialog` on every delete button, but enforcement has been piecemeal. Need a one-time audit + fix across the entire codebase, plus a guard so future deletes can't ship without it.

### Approach

**Phase 1 — Audit (grep-driven)**
Search all `.tsx` for delete patterns missing the dialog:
- `delete*.mutate(` / `remove*.mutate(` called directly inside `onClick`
- `Trash2` icon buttons whose `onClick` runs a mutation directly
- `supabase.from(...).delete()` invoked from a click handler without a dialog wrapper

Cross-reference against files that already import `ConfirmDestructiveDialog` to skip compliant ones.

**Phase 2 — Fix (uniform pattern)**
For every offender apply the standard wrap:
```tsx
const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
<Button onClick={() => setConfirmDeleteId(item.id)}><Trash2/></Button>
<ConfirmDestructiveDialog
  open={!!confirmDeleteId}
  title="Delete <Entity>?"
  description="<entity-specific consequence>. This cannot be undone."
  confirmLabel="Delete"
  isLoading={mutation.isPending}
  onConfirm={() => confirmDeleteId && mutation.mutate(confirmDeleteId, { onSuccess: () => setConfirmDeleteId(null) })}
  onCancel={() => setConfirmDeleteId(null)}
/>
```
Tailored description per entity (cascading warnings for parent records like programs, KRAs, workflow templates, users).

**Likely modules requiring fixes** (final list determined by audit):
- Incentive: `IncentiveProgramsList`, `IncentiveSlabEditor`, `EligibilityRulesEditor`, `DqRulesTab`, `BUSubUnitsTab`, `AllocationTab`, `FieldsTab`
- Admin: User management (delete user), KRA Library (delete KRA/KPI), Workflow templates, Menu Access, Access Profiles, Review Periods, Email Templates, Master Data tabs (companies/divisions/BUs/depts/designations/grades/locations), Org KPI master, Production Targets
- PMS: KPI Observations delete, Query delete, Evidence file remove, Comment delete
- Notifications: clear/delete notification
- Misc: any `Trash2` button found in audit

**Phase 3 — Future-proofing**
Add a lightweight ESLint custom rule (or a `scripts/check-delete-guards.ts` CI check) that flags any `Trash2` icon-button or `*delete*.mutate(` call in JSX whose nearest sibling tree doesn't reference `ConfirmDestructiveDialog`. Run in CI to block regressions.

Also update `mem://design/destructive-action-governance` with: "Every new delete button MUST use `ConfirmDestructiveDialog`. CI lint enforces this."

### Files Touched
| Area | Count (est.) |
|---|---|
| Incentive components | ~5–7 |
| Admin master-data tabs | ~10–15 |
| PMS review/observation/query | ~3–5 |
| Notification + misc | ~2–3 |
| New: `scripts/check-delete-guards.ts` + CI hook | 1 |
| Updated: `DOCUMENTATION.md`, `POLICY.md`, governance memory | 3 |

Exact file list produced by the Phase-1 audit at start of execution.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Safer — system-wide accidental-delete prevention |
| Workflow | One extra confirm click per delete (already standard pattern) |
| UI/UX | Consistent — same dialog component everywhere |
| Regression | Very low — purely additive UI guard, no logic changes to mutations |
| Mitigation | Reuse existing `ConfirmDestructiveDialog`; CI lint blocks new violations |

### Out of Scope
- Bulk-delete flows that already have multi-step confirmation (e.g. Bulk Zero-Score) — review only, no rewrite
- Soft-delete / archive actions (not destructive in same sense)
- Backend cascade behaviour changes

