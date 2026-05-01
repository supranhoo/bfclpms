## Phase 5 — Definition Split (inverse of merge)

The Alias Drift card on the Health tab already tells admins *"Review and split if the variants are not truly the same KPI"* — but there's no action. Phase 5 closes that loop: when alias drift reveals two real KPIs accidentally grouped under one canonical definition, the admin can split them apart safely, with the same governance rigour as Phase 4c merge (transactional, audited, admin-only, forward-only).

### Scope

Add a **Split Definition** flow that takes one definition `D` plus a partition of its aliases (group A vs group B), and produces:
- The original definition `D` keeping group-A aliases (canonical text optionally renamed).
- A new definition `D'` adopting group-B aliases (admin supplies its canonical KRA/KPI text).
- All `kpis.kpi_definition_id` rows currently linked to `D` are re-pointed to `D` or `D'` based on which alias their `(kra_name, kpi_name)` matches. Rows with no matching alias stay on `D` (the "default" survivor).
- One `KPI_DEFINITION_SPLIT` row in the existing `kpi_registry_audit_log` (table already supports new actions per Phase 4c).

### Out of scope

- No three-way splits (split into N≥3). Admin can repeat the operation.
- No automatic detection of which aliases should go to which side — admin chooses explicitly.
- No edits to historical `kra_name` / `kpi_name` text on KPIs (§88B still wins).
- No employee-facing UI.

---

### Sub-Phase 5a — Transactional `split_definition` RPC + audit

**Migration adds:**

```text
split_definition(
  p_source_id          uuid,    -- definition being split
  p_keep_alias_ids     uuid[],  -- aliases that stay on source
  p_move_alias_ids     uuid[],  -- aliases that move to new definition
  p_new_kra_name       text,    -- canonical text for the NEW definition
  p_new_kpi_name       text,
  p_rename_source_kra  text,    -- optional rename of the source canonical
  p_rename_source_kpi  text,
  p_reason             text
) RETURNS jsonb
```

Behaviour, all in one transaction with `FOR UPDATE` locks on the source definition and every affected alias:

1. Admin gate via `has_role(auth.uid(), 'admin')`. Refuse otherwise.
2. Validate `p_keep_alias_ids` ∪ `p_move_alias_ids` covers **every** alias of `p_source_id` exactly once (no overlap, no orphans). Refuse otherwise — admin must make an explicit decision for each alias.
3. Validate `p_move_alias_ids` is non-empty (else this is just a rename — wrong tool).
4. Insert new `kpi_definitions` row in the same `category_id` with `(p_new_kra_name, p_new_kpi_name)`. Hits the existing UNIQUE `(canonical_kra_name, canonical_kpi_name, category_id)` index — surface a clear error if it collides.
5. `UPDATE kpi_name_aliases SET definition_id = <new_id> WHERE id = ANY(p_move_alias_ids)`. Re-parents only.
6. Re-point KPIs: for every row in `kpis` where `kpi_definition_id = p_source_id`, look up its `(kra_name, kpi_name, category_id)` against `kpi_name_aliases` to see whether that signature now belongs to the new definition; if so, set `kpi_definition_id = <new_id>`. KPIs whose signature still matches a kept alias (or matches no alias at all) stay on the source. **Forward-only**: the same pattern as Phase 4c — only `kpi_definition_id` FKs change, the text columns are never touched.
7. Optionally rename the source canonical text (`p_rename_source_*`) — useful when the split forces both sides to get a more specific name. Skip if NULLs.
8. Insert one audit row: `action = 'KPI_DEFINITION_SPLIT'`, `primary_definition_id = source`, `affected_definition_id = new`, `payload` carrying both canonical snapshots (before + after rename), the kept/moved alias arrays, and the count of re-pointed KPIs.
9. Return JSON summary `{ success, source_id, new_id, moved_aliases, repointed_kpis, renamed_source }`.

Concurrency: lock the source definition first, then aliases in ascending UUID order — same deterministic strategy as `merge_definitions` to avoid deadlocks if an admin runs both flows in parallel.

### Sub-Phase 5b — Split UI on the Suggestions tab

Add a third section to `SuggestionsTab` (or a new `SplitTab` if section count gets noisy — decision below). Lists the same drift rows already exposed by `detect_alias_drift`, but with a **Split** action per row. Clicking opens a `SplitDefinitionDialog`:

```text
+------------------------------------------------------+
| Split: <source canonical KRA / KPI>                  |
+------------------------------------------------------+
| Keep on original                | Move to new        |
| [ ] Alias 1 (variant text)      | [x] Alias 5        |
| [x] Alias 2                     | [x] Alias 6        |
| [x] Alias 3                     | [ ] Alias 7        |
| [ ] Alias 4                     | [x] Alias 8        |
+------------------------------------------------------+
| New definition canonical name:                       |
|   KRA: [_________________]  KPI: [_________________] |
| Optionally rename original (leave blank to keep):    |
|   KRA: [_________________]  KPI: [_________________] |
+------------------------------------------------------+
| Reason (required, free text):                        |
|   [____________________________________________]     |
+------------------------------------------------------+
| Live preview: 12 KPI links will move, 18 will stay.  |
+------------------------------------------------------+
[ Cancel ]                          [ Split definition ]
```

- Two-column checkbox list of every alias (loaded via existing alias-by-definition query). Each alias must end up on exactly one side; the dialog enforces this client-side and the RPC enforces it server-side.
- The "Move to new" column must end up non-empty before the submit button enables.
- A small live counter: how many `kpis` rows would land on each side. Driven by a cheap preview RPC `preview_split_definition(p_source_id, p_move_alias_ids)` that returns `{ stay_count, move_count }` so the admin sees impact before committing.
- Wraps `ConfirmDestructiveDialog` per the Core safety rule (split deletes the source's existing structure, even though no rows are dropped).
- On success: toast with the counts, refresh both Health drift list and the suggestions tile.

**Decision needed**: place the split UI *(a)* as a third section in the existing `SuggestionsTab`, or *(b)* as a new 7th tab `SplitTab`. Recommendation: option (a) — it keeps governance actions consolidated and the drift list is small. Easy to flip later.

### Sub-Phase 5c — Audit viewer hookup (lightweight)

The new `KPI_DEFINITION_SPLIT` rows land in `kpi_registry_audit_log` automatically. To make them visible without building a full audit viewer right now:

- Extend the existing "Pending Auto-Merge Suggestions" tile on the Health tab into a small **Recent Registry Activity** card that lists the last 5 entries from `kpi_registry_audit_log` (action + performer + timestamp + summary). Read-only. Two new RPCs already exist for similar admin-only aggregates; this just adds a `get_recent_registry_audit(p_limit int default 5)` SECURITY DEFINER reader, admin-gated.
- Defers the full audit-log viewer (one of the optional follow-ups from the previous turn) to a later phase — out of scope here.

---

### Risk & Impact

- **Data Impact**: `split_definition` only touches `kpi_definitions` (insert + optional rename), `kpi_name_aliases.definition_id` (re-parent), and `kpis.kpi_definition_id` (re-point). Pre-May-2026 KPIs were never linked, so they stay untouched by definition. Historical text columns are not modified.
- **Workflow Impact**: Admin-only surface. No effect on Manager/Employee/Auditor flows. Scoring is unaffected — splitting two KPIs apart doesn't change their raw values, just which canonical group they're attributed to.
- **UI/UX Consistency**: Reuses `ConfirmDestructiveDialog`, table styling, and the existing `Sparkles` / `GitMerge` iconography (will use `GitBranch` for split). Same admin-only route.
- **Regression Risk**:
  - Wrong KPIs land on the wrong side → mitigated by the alias-coverage validation, the live KPI-count preview, and the immutable audit row that lets us reverse via a follow-up merge if needed.
  - Concurrent admin merges and splits on the same definition → mitigated by the same row-lock ordering used in Phase 4c.
  - UNIQUE collision on the new canonical name → caught by the existing index; RPC raises a friendly message.
- **Mitigation**: unit tests on the alias partition validator, an integration scenario fixture covering "split forces a rename", and the live preview RPC so admins never commit blind.

### Sequencing

```text
5a (split_definition + audit row + preview RPC)
  -> 5b (SplitDefinitionDialog + drift-row Split action)
  -> 5c (Recent Registry Activity card on Health tab)
```

### Deliverables

- Migration: `split_definition`, `preview_split_definition`, `get_recent_registry_audit`, plus index touch-ups if needed.
- Hooks: `useSplitDefinition`, `useSplitPreview`, `useRecentRegistryAudit`.
- Components: `SplitDefinitionDialog`, drift-row `Split` button, "Recent Registry Activity" card on `HealthCoverageTab`.
- Tests: alias-coverage validator unit tests; threshold + preview hook tests in the same style as Phase 4 tests.
- Docs: `POLICY.md` §88H §§13–15 (split governance), `DOCUMENTATION.md` Phase 5 section, `.lovable/plan.md` Phase 5 progress block, refresh `mem://features/admin/kpi-standardization-registry`.

### Open question

UI placement: extend `SuggestionsTab` with a third "Splits" section (recommended) **or** add a 7th `SplitTab`? Default to the section unless you say otherwise.