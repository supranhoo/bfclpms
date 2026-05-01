## Why these gaps exist today

The KPI Standardization module currently treats every action as one-shot:

- **Build Registry → Approve as Canonical**: One click writes to `kpi_definitions` + `kpi_name_aliases`. There is no preview of the actual KPI rows behind a duplicate group, no way to edit the canonical name before approving, and no "undo" beyond going to **Review Registry** and using the trash icon (which is a hard delete with a destructive confirm — not a true undo because it removes the entry rather than reverting it).
- **Review Registry**: You can see linked aliases but cannot edit the canonical KRA/KPI name, cannot drill into the actual KPI rows / employees affected, and cannot remove a single alias (only delete the whole entry).
- **Correct May KPIs → Apply**: Calls `correct_may_kpis` RPC which `UPDATE`s `kpis.kra_name`, `kpi_name`, `kpi_definition_id` and the same on `org_kpi_values`. **No before-image is saved**, so today there is no safe way to undo a rename — the original name is lost.

So the user's three asks map to three concrete fixes.

---

## Fix 1 — Undo (history + reversal)

Add a lightweight, append-only history table so every standardization action can be inspected and reversed:

```text
kpi_standardization_actions
  id                    uuid pk
  action_type           text  -- 'create_definition' | 'link_alias' | 'rename_kpis' | 'delete_definition' | 'edit_definition' | 'unlink_alias'
  definition_id         uuid null
  category_id           uuid null
  payload               jsonb -- before/after snapshot (canonical names, alias rows, affected kpi ids, old/new kra+kpi)
  affected_row_count    integer
  performed_by          uuid null  -- nullable for system-performed
  performed_at          timestamptz default now()
  reversed_at           timestamptz null
  reversed_by           uuid null
```

Every existing write path logs one row:

- `useBuildRegistry.createDefinitionWithAliases` → logs `create_definition` (with `reused: true/false`) and one `link_alias` row per inserted alias (or a single batched row with the alias array in `payload`).
- `ReviewRegistryTab.handleDelete` → logs `delete_definition` with the full alias list snapshot.
- `correct_may_kpis` RPC → extended to capture before-image (`old_kra`, `old_kpi`, array of affected `kpi.id`s and `org_kpi_values.id`s) into the action row inside the same transaction.

New tab: **History & Undo** (or a panel inside Review Registry). Lists recent actions with: timestamp, who, what, count, and an **Undo** button when `reversed_at IS NULL`. Undo behavior per type:

- `create_definition` → delete the definition + its aliases (only if no `kpis.kpi_definition_id` still references it; otherwise show "X KPI rows still link to this — unlink first or use Rename to point them elsewhere").
- `link_alias` → delete those alias rows.
- `rename_kpis` → reverse `UPDATE` using the saved before-image (restores `kra_name`, `kpi_name`, sets `kpi_definition_id` back to NULL or its prior value). Same on `org_kpi_values`.
- `delete_definition` → re-insert the definition + aliases from the snapshot.

RLS: only Admin can read/undo. Action rows are immutable — no UPDATE policy except a SECURITY DEFINER function `reverse_standardization_action(action_id)` that flips `reversed_at`/`reversed_by` and performs the inverse mutation atomically.

## Fix 2 — Detailed KPI view (drill-in)

Behind every duplicate group and every registry entry, show what's actually affected:

- **Build Registry tab** — each variant row gets a "View KPIs" expander showing the actual `kpis` rows for that `(category_id, kra_name, kpi_name)`: employee name, department, review period/year, weightage, status. Loaded on demand (paginated, 25 per page) so scan stays fast.
- **Review Registry tab** — expanding a registry entry already shows aliases; add a second sub-section "Linked KPI rows" with the same paginated employee/period table. Add per-alias actions: **Unlink alias** (logs `unlink_alias`, undoable) and per-row **View in KPI Mapping Matrix** deep link.
- **Correct May KPIs tab** — the existing list shows `row_count` only; add a "View affected employees" disclosure listing the employees + periods that will be renamed, so the user sees exactly what "Apply" will touch.

All drill-in queries use server-side pagination per the existing **Large Export Pagination Policy** (`mem://architecture/database/large-export-pagination-policy`).

## Fix 3 — Edit before it becomes "final"

Two edit surfaces:

1. **Build Registry — pre-approval edit**: replace the read-only canonical radio with an editable canonical row. The user can pick a variant and then tweak the KRA name or KPI name text inline before clicking **Approve as Canonical**. Validation: non-empty, trimmed, length limits. The chosen text becomes `canonical_kra_name` / `canonical_kpi_name`; all listed variants (including the originally selected one if its text now differs) are written as aliases.

2. **Review Registry — post-approval edit**: add a pencil icon next to each registry row that opens an **Edit Canonical Definition** dialog:
   - Edit `canonical_kra_name` and `canonical_kpi_name`.
   - Choose the **propagation mode**:
     - *Registry only* — updates `kpi_definitions` row only (alias mappings unchanged; downstream `kpis.kra_name` text is left as-is, only `kpi_definition_id` linkage matters going forward).
     - *Registry + propagate to current period KPIs* — also runs the equivalent of `correct_may_kpis` for every `(period, year)` from May 2026 onward where rows currently link to this `definition_id`. Past data (pre-May 2026) is never touched, matching the existing safety check.
   - Logs `edit_definition` with full before-image so it is undoable.

Add a **"Promote to alias"** action on the edit dialog so an admin can demote the current canonical to an alias and elect any existing alias to become the new canonical, in one transaction.

---

## UX summary

```text
KPI Standardization
├── Build Registry        [+ inline editable canonical, + drill-in to KPI rows]
├── Review Registry       [+ edit pencil, + drill-in employees, + per-alias unlink]
├── Correct May KPIs      [+ "View affected employees" expander]
├── Governance
├── Health & Coverage
├── Suggestions
└── History & Undo        [NEW — last 200 actions, Undo button per row]
```

## Risk & Impact Report

- **Data Impact**: New table `kpi_standardization_actions` (additive, no schema break). `correct_may_kpis` extended to also INSERT into the actions table inside the same transaction — backward compatible (same signature, same return). No change to existing `kpis` / `kpi_definitions` / `kpi_name_aliases` columns. Pre-May-2026 data still frozen.
- **Workflow Impact**: All existing buttons behave the same; new buttons (Edit, Undo, View affected) are additive. Approve-as-Canonical stays idempotent (Phase already shipped).
- **UI/UX Consistency**: Reuses `ConfirmDestructiveDialog` for risky undo (e.g. undoing a rename that touches many rows), reuses existing collapsible/table primitives. Pagination follows the established 25/50/100 pattern from KPI Weightage Dashboard.
- **Regression Risk**: Low. Mitigations:
  - Unit tests: undo logic per action type, pre-approval edit validation, propagation switch behavior.
  - The undo SECURITY DEFINER function refuses to act on already-reversed actions and on actions whose target rows have changed shape since (signature mismatch → require manual cleanup).
  - Hard cutoff: undo of `rename_kpis` is rejected if the referenced `kpis.id`s no longer exist or have since been re-renamed by a later action — surfaced as an actionable toast.
- **Security**: New RLS — only Admin can read or reverse actions. The reverse function is SECURITY DEFINER with explicit role check via `has_role(auth.uid(),'admin')`.
- **Audit**: The actions table itself is the audit trail. `performed_by`/`reversed_by` set per the System Performer Attribution rule (NULL when system-driven).

## Files to touch

**New**
- `supabase/migrations/<ts>_kpi_standardization_actions.sql` — table, RLS, `reverse_standardization_action(uuid)`.
- `supabase/migrations/<ts>_correct_may_kpis_v2.sql` — extend RPC to log action with before-image.
- `src/hooks/useStandardizationHistory.ts` — list + reverse hook.
- `src/components/admin/kpi-standardization/HistoryUndoTab.tsx`
- `src/components/admin/kpi-standardization/EditDefinitionDialog.tsx`
- `src/components/admin/kpi-standardization/AffectedKpisTable.tsx` — shared paginated table used by all three tabs.
- Tests: `src/hooks/useStandardizationHistory.test.ts`, `src/components/admin/kpi-standardization/EditDefinitionDialog.test.tsx`, plus extension to `useBuildRegistry.test.ts` for the editable canonical path.

**Modified**
- `src/hooks/useKpiRegistry.ts` — `createDefinitionWithAliases` accepts an explicit canonical (already does) but now also writes action rows; add `editDefinition`, `unlinkAlias`, `deleteDefinition` (wrapping current delete to log).
- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx` — inline canonical editor + drill-in.
- `src/components/admin/kpi-standardization/ReviewRegistryTab.tsx` — edit pencil, per-alias unlink, drill-in.
- `src/components/admin/kpi-standardization/CorrectMayKpisTab.tsx` — "View affected employees" expander.
- `src/pages/admin/KpiStandardization.tsx` — add 7th tab "History & Undo".
- `DOCUMENTATION.md`, `POLICY.md`, `mem://features/admin/kpi-standardization-registry` — document undo guarantees, the action table contract, and the pre-May-2026 freeze interaction with undo.
