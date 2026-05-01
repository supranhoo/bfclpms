## Phase 4 — Auto-Merge Suggestions for the Canonical Registry

Phase 3 made the registry visible and useful. Phase 4 helps admins **find duplicates they didn't know existed** — definitions that should probably be merged, and unlinked signatures that fuzzily match an existing definition. All suggestions are **advisory**: the admin always confirms.

This phase strictly respects §88A–§88G: pre-May-2026 data is never touched, historical names never silently rewritten, and no automatic merging happens.

---

### Goals

1. Surface **definition-vs-definition** duplicate candidates (e.g. "On-Time Delivery" and "OTD %" in the same category) using fuzzy matching beyond the current `LOWER(TRIM())` rule.
2. Surface **signature-vs-definition** alias candidates — unlinked KPI signatures from May 2026+ that closely resemble an existing canonical definition but weren't auto-linked because they're not exact-match aliases yet.
3. Give admins **one-click "promote as alias"** and **"merge definitions"** flows, both gated by an explicit confirm dialog.
4. Keep everything inside the existing `/admin/kpi-standardization` Governance/Health surface — no new top-level pages.

### Non-Goals

- No automatic merging or alias creation. Suggestions only.
- No ML or external services. Pure Postgres `pg_trgm` similarity + token-overlap heuristics.
- No retroactive rewrite of pre-May-2026 KPI text.
- No employee-facing UI — admins only.

---

### Sub-Phase 4a — Fuzzy Suggestion Engine (DB)

Enable `pg_trgm` (already common in Supabase) and add three SECURITY DEFINER admin RPCs:

- `suggest_definition_merges(p_min_similarity numeric default 0.55, p_limit int default 50)` — pairs of `kpi_definitions` in the **same category** whose `(canonical_kra_name || ' ' || canonical_kpi_name)` similarity ≥ threshold. Returns left/right definition ids, names, similarity score, alias counts, and linked-row counts (to help admins judge impact).
- `suggest_alias_candidates(p_min_similarity numeric default 0.6, p_limit int default 100)` — unlinked May 2026+ signatures (from existing `get_unlinked_signatures` shape) paired with their best-matching canonical definition in the same category, when similarity ≥ threshold. One row per signature.
- `dismiss_suggestion(p_kind text, p_left_id uuid, p_right_id uuid)` — records an admin "not a duplicate" decision so it stops appearing.

New table `registry_suggestion_dismissals (kind text, left_id uuid, right_id uuid, dismissed_by uuid, dismissed_at timestamptz, PRIMARY KEY(kind,left_id,right_id))` with RLS limited to admins. Both suggestion RPCs anti-join this table.

All three RPCs raise on non-admin callers (mirrors existing Phase 2c pattern). Pre-May-2026 KPIs excluded via `is_canonical_enforcement_period()`.

### Sub-Phase 4b — Suggestions Tab in Admin UI

Add a 6th tab `SuggestionsTab` to `/admin/kpi-standardization`. Two sections:

- **Definition Merge Candidates** — table with: Definition A, Definition B, similarity %, linked-row counts, alias counts. Per-row actions:
  - **Merge** → opens `ConfirmDestructiveDialog` (per Core safety rule) showing exactly what will happen: pick which definition survives, the other definition's aliases get reassigned, its `kpi_definition_id` references on `kpis`/`org_kpi_values` get repointed, then it's deleted. Wraps a new RPC `merge_definitions(p_keep uuid, p_drop uuid)`.
  - **Dismiss** → calls `dismiss_suggestion('definition_merge', …)`.
- **Alias Promotion Candidates** — table with: unlinked signature, best-match canonical, similarity %, occurrence count. Per-row actions:
  - **Promote as alias** → calls existing `promote_signature_to_definition` flow but pre-fills the definition target. Light dialog (not destructive).
  - **Dismiss** → `dismiss_suggestion('alias_candidate', …)`.

Threshold sliders at top (Definition match ≥ 0.55, Alias match ≥ 0.6) so admins can tune without code changes. Defaults persist per-user in `system_settings` is overkill — use `localStorage` only.

`useRegistrySuggestions()` hook parallel-loads both endpoints, 5-min `staleTime`, fails open (existing pattern from `useRegistryHealth`).

### Sub-Phase 4c — Hardening & Audit

- `merge_definitions` writes one `KPI_DEFINITION_MERGED` audit row per affected KPI (`performed_by = auth.uid()`, payload includes both definition snapshots) so the action is fully traceable. Wrapped in transaction; rolls back if any step fails.
- Concurrency: `merge_definitions` `LOCK` both rows `FOR UPDATE` to prevent two admins racing on the same merge.
- Idempotency: dismissals use the PK `(kind, left_id, right_id)` so re-clicking is a no-op.
- Health dashboard gets a small KPI tile: "Open suggestions: N merges + M aliases" linking to the new tab.

---

### Risk & Impact

- **Data Impact:** `merge_definitions` rewrites `kpi_definition_id` FKs on `kpis` and `org_kpi_values` for May 2026+ rows only (gated by `is_canonical_enforcement_period`). It does **not** modify the historical `kra_name`/`kpi_name` text — that stays per §88B. Aliases get re-parented, not deleted.
- **Workflow Impact:** New admin tab. Other roles unaffected.
- **UI/UX:** One new tab in an admin-only page. Reuses `ConfirmDestructiveDialog`, `GitMerge` icon, threshold-slider pattern.
- **Regression Risk:** Medium-high on `merge_definitions` (touches FKs in two tables). Mitigation:
  - Transactional execution with explicit row locks.
  - Unit tests covering: alias re-parenting collisions (same `(definition_id, variant_kra, variant_kpi)` already exists on the survivor → skip insert, no-op), pre-May-2026 KPIs untouched, audit row written, dismissal idempotency.
  - Dry-run preview in the confirm dialog showing exact counts before commit.
- **Performance:** `pg_trgm` similarity over the ~hundreds of definitions/signatures we expect is well within budget. Both suggestion RPCs are admin-triggered, not on hot paths.

### Sequencing

```text
4a (DB engine + dismissals) → 4b (Suggestions tab UI) → 4c (Merge RPC + audit + Health tile)
```

### Deliverables per sub-phase

- Migration files for new RPCs / table / pg_trgm extension.
- Hook + component + tests (`useRegistrySuggestions.test.ts`, `mergeDefinitionsValidation.test.ts`).
- Updated `DOCUMENTATION.md`, `POLICY.md` (new §88H — Auto-merge suggestion governance).
- `mem://features/admin/kpi-standardization-registry` refresh with Phase 4 section.

---

### Open Question

Default similarity threshold for **definition merge** suggestions: 0.55 is intentionally generous so admins see borderline cases. If you'd rather start conservative (fewer false positives, fewer suggestions to review), I can default to 0.7. Either is one-line to change.

---

## Phase 4 Progress

- Sub-Phase 4a (DB engine)        ✅ shipped 2026-05-01 (§88H) — pg_trgm, registry_suggestion_dismissals, suggest_definition_merges, suggest_alias_candidates, dismiss_suggestion.
- Sub-Phase 4b (Suggestions tab)  ✅ shipped 2026-05-01 (§88H) — SuggestionsTab (6th tab), threshold sliders persisted to localStorage, alias promotion via existing promote_signature_to_definition. Definition Merge button stubbed pending 4c.
- Sub-Phase 4c (merge_definitions + audit + Health tile) ✅ shipped 2026-05-01 (§88H) — `kpi_registry_audit_log` table (admin-only, append-only), transactional `merge_definitions(p_keep_id, p_drop_id, p_reason)` RPC with row locks, alias re-parenting + conflict drop, canonical backfill alias, KPI re-pointing, single `KPI_DEFINITION_MERGED` audit row, auto-dismissal of the merged pair. UI: per-row **Keep A / Keep B** buttons + live confirm dialog wired to `useMergeDefinitions`. Health tab now shows a "Pending Auto-Merge Suggestions" tile via `get_registry_pending_suggestion_count` + `usePendingSuggestionCount`.