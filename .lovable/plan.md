## Org KPI Data Entry — Combined Plan (Layer B/C/D + Self-ID RCA)

### Part 1 — Why-Why RCA (your own ID showing empty list)

Confirmed from DB + code read:

| # | Why | Evidence |
|---|---|---|
| 1 | Why does the page show "No org-level KPIs found" for April 2026? | `filteredKpis` is empty even though April 2026 has 171 unique org KPI definitions (861 child rows). |
| 2 | Why is `filteredKpis` empty? | It is derived from `ownershipFilteredKpis`. When `isAdmin=false`, only KPIs whose `ownershipMap[key].canEdit === true` survive. |
| 3 | Why is `isAdmin=false` for an admin? | `isAdmin = effectiveRole === 'admin'`. `effectiveRole` returns `naturalRole` whenever `role==='admin' && isAdminMode===false`. The Admin-Mode toggle is persisted in `localStorage` per browser — toggling it off on **any** machine flips an admin into "Manager/Employee view" silently. Many of you have hit "Switch to Manager view" once and forgotten. |
| 4 | Why does the masked admin then see zero KPIs (instead of the ones they actually own)? | Two compounding bugs in `OrgKpiDataEntry.tsx`: **(a)** `useOrgKpiOwnershipMap` is **NOT** gated on `isReady && !!user` (POLICY §96 violation) — on cold mount it returns an empty map until the second tick, so every KPI fails the `canEdit` check and the memo collapses to `[]`. **(b)** Even after the map loads, key matching in `ownershipFilteredKpis` uses `kpiKey()` which lower-cases + collapses whitespace, but the ownership-map builder in `useOrgKpiOwnershipMap` only does `replace(/\r/g,'').toLowerCase()` (no whitespace collapse). KPI names that contain double spaces, tabs, or trailing spaces (we have several in the HR/Compliance set) produce **different keys on the two sides**, so the lookup misses. |
| 5 | Why does refreshing "sometimes" fix it? | After the map finally arrives in the cache, a manual reload re-hydrates with the data already present, so the first `useMemo` pass already sees a populated map. This is the same race we patched for `useOrgLevelKpis` (ADR-052) — the ownership hook was missed. |
| 6 | Why did propagation appear to do nothing for Vivek even after the new `pre_review_only` policy? | Of his 234 owner rows, **29** do not match any current April 2026 KPI definition because owner-table KRA/KPI strings differ from `kpis` strings by whitespace / `\r` only. The RPC joins by literal text, so those rows are silently skipped. Same root cause as #4(b). |
| 7 | Why has this gotten worse over time? | Each migration (KPI Standardization Registry, KRA Library Master, Copy-KRAs) has rewritten KRA/KPI strings in `kpis` but **not** retroactively normalised `org_kpi_data_owners`. The drift accumulates monthly — April has 29 mismatches, May has 33. |

### Part 2 — Risk & Impact Report
- **Data**: No schema change for the bug fixes; one cleanup UPDATE normalises whitespace/CR in `org_kpi_data_owners` (~30 rows, fully reversible — old values logged to `kpi_audit_logs`).
- **Workflow**: Visibility fix only. Propagation behaviour unchanged beyond the already-shipped policy tier.
- **UI/UX**: Adds a "Mismatched Values" badge + "Admin view masked" banner. Non-breaking.
- **Regression risk**: Low. All key-builder changes are colocated and covered by new unit tests.

### Part 3 — Fix Plan

#### A. Race & key-mismatch fixes (root cause of your empty list)
1. Gate `useOrgKpiOwnershipMap` and `useOrgKpiDataOwnerNames` on `isReady && !!user` and include `user?.id` in their query keys (mirror ADR-052). Add the keys to AuthContext's first-ready invalidation set.
2. Centralise key normalisation in `src/lib/orgKpiKey.ts` (`normalizeKpiKey(catId, kra, kpi)` → lowercase + `\r` strip + `\s+`-collapse + trim). Replace the 4 ad-hoc copies in `useOrgLevelKpis.ts`, `useOrgKpiDataOwner.ts`, `OrgKpiDataEntry.tsx`, and the propagation RPC's audit emit. Unit tests for whitespace/CR/case parity.
3. In `OrgKpiDataEntry.tsx`, add a banner when `role==='admin' && !isAdminMode`: "You are viewing as <natural role>. Switch to Admin view to see all KPIs you can edit."

#### B. Layer B — UI surfacing for the propagation policy
4. `OrgKpiEntryCard.tsx`: new "Value mismatch" badge when OKV is `propagated/approved` but at least one child `review_submissions.self_score` differs from `OKV.derived_self_score`. Roll counts up into the page header chip "Mismatched Values: N".
5. `PropagationPreviewDialog.tsx`: show per-employee diff (`Old → New`) and warn rows that will be skipped because the child is locked at `manager_check`+.

#### C. Layer C — One-shot data cleanup (May 2026 cutoff per Migration Governance)
6. Migration `<ts>_normalize_org_kpi_owner_keys.sql`:
   - For each `org_kpi_data_owners` row, write back `kra_name`/`kpi_name` after `regexp_replace(...,'\s+',' ','g')` + `replace(...,E'\r','')` + `trim`. Audit each change to `kpi_audit_logs` action `OWNER_KEY_NORMALIZED`.
   - Re-run `propagate_org_kpi_value(..., 'force_pre_terminal')` for the ~14 mismatched April rows in Vivek's scope and any equivalent rows surfaced for other owners by query #4 above. Bounded ≤ 50 rows total.
   - Soft-delete the 7 phantom May "entered" OKV rows for *Timely execution of new HR interventions* with `achieved_value IS NULL`.

#### D. Layer D — Tests, docs, memory
7. New `src/test/orgKpiPropagationOverwrite.test.ts` (kra_set / self_review-no-action / manager_check-skip / terminal-skip / force overwrite / audit row).
8. New `src/test/orgKpiKeyNormalization.test.ts` covering whitespace/CR parity between owner map and KPI list.
9. ADR-053 (Tiered overwrite policy) + ADR-054 (Owner-key normalisation contract).
10. POLICY §88.2 update; POLICY §96 expanded to list the three newly-gated query keys.
11. CHANGELOG_2026 W2 row.
12. Memory: update `mem://architecture/auth-readiness-query-gate` (add owner-map keys) and create `mem://features/admin/org-kpi-key-normalization`.

### Part 4 — Files
- New: `src/lib/orgKpiKey.ts`, `src/lib/orgKpiKey.test.ts`, `src/test/orgKpiPropagationOverwrite.test.ts`, `src/test/orgKpiKeyNormalization.test.ts`, `supabase/migrations/<ts>_normalize_org_kpi_owner_keys.sql`, `docs/adr/ADR-053.md`, `docs/adr/ADR-054.md`, `mem://features/admin/org-kpi-key-normalization`.
- Edit: `src/contexts/AuthContext.tsx`, `src/hooks/useOrgKpiDataOwner.ts`, `src/hooks/useOrgLevelKpis.ts`, `src/pages/admin/OrgKpiDataEntry.tsx`, `src/components/admin/OrgKpiEntryCard.tsx`, `src/components/admin/PropagationPreviewDialog.tsx`, `POLICY.md`, `DOCUMENTATION.md`, `CHANGELOG_2026.md`, `mem://architecture/auth-readiness-query-gate`, `mem://index.md`.

Approve to implement A→B→C→D in that order.
