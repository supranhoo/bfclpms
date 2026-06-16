## 1. Assumptions

- The reported issue is the recurring Org KPI Data Entry propagation problem shown in the attached screenshots:
  - `row(s) holding 0 were not propagated`
  - `employee KPI(s) could not be advanced — Repair Gap`
  - rows visually showing saved/propagated while a red toast says propagation failed.
- Scope is investigation + resolution plan only; no code or database changes are being made yet.
- Org KPI must remain conservative: never propagate a local-only value that failed to persist, but never block a deliberately saved `0`.

## 2. Clarifications

Decision needed before implementation:

1. **Policy cleanup depth:** should we only add Org KPI-specific clarifications, or also renumber/rename duplicate POLICY sections like the multiple `§111` / `§112` collisions?
2. **`not_authorized` classification:** I recommend treating it as an expected/diagnostic skip, not a generic “Repair Gap” failure. It should show clear authorization wording, not “refresh and retry.”

## 3. Risk & Impact Report

### Data Impact
- No direct data deletion proposed.
- Propagation writes affect `kpis`, `review_submissions`, `org_kpi_values`, and audit logs.
- The resolution must preserve already-approved/finalized scores and must not overwrite frozen downstream submissions except through existing Admin override rules.

### Workflow Impact
- Data Owner flow remains: enter value → Save → Propagate.
- Saved `0` should propagate like any other saved value.
- Already-propagated / reviewer-locked rows should not show destructive errors.
- True missing scorecard rows should still surface as a repair action.

### UI/UX Impact
- Red error toasts will be reduced to true failures only.
- Zero-value rows will show explicit, current guidance: save row/card first, then propagate.
- Repair Gap messaging will be reserved for real gaps, not already-propagated or authorization-skipped rows.

### Regression Risk
- High if fixes are made piecemeal again.
- Main risk areas:
  - saved-zero guard
  - half-propagation forward guard
  - skip-reason classification
  - stale snapshot/cache refresh
  - policy/test contradictions.

### Mitigation Plan
- Consolidate predicates into small pure helpers where possible.
- Add regression tests for full Save → Propagate workflows, not only isolated predicates.
- Update `DOCUMENTATION.md` and `POLICY.md` in the same change.
- Keep changes surgical; no broad Org KPI refactor.

### Scalability Impact
- Avoid adding per-employee N+1 reads.
- Use existing snapshot maps (`propagatedEmpIdsByKey`, `kraSetEmpIdsByKey`, mapped employee ids) instead of loading full datasets blindly.
- Any repair-gap validation should compare sets already available from snapshot/RPC results.
- No pagination change needed for this fix because the touched surface already works on scoped card rows and snapshot maps; however, no new unbounded client reads should be introduced.

## 4. Detailed RCA Findings

### Finding A — Saved `0` is still vulnerable in the chained Save → Propagate path

Current code has a DB-aware guard:

- `src/pages/admin/OrgKpiDataEntry.tsx:961-979`
- It allows `0` only when `dbAchievedValue === 0`.

But the chained Save → Propagate path can call `getValues()` before the save result has updated local `dbAchievedValue`:

- `src/components/admin/OrgKpiEntryCard.tsx:686-690`
- `src/components/admin/OrgKpiEntryCard.tsx:529-574`
- Optimistic `dbAchievedValue` update exists in `performSave()` at `src/components/admin/OrgKpiEntryCard.tsx:630-640`, but chained `handleSaveAndPropagate()` bypasses `performSave()` and calls `onSaveAndPropagate(getValues())` directly.

**RCA:** the saved-zero fix was applied to the explicit Save path, but not fully to the chained Save → Propagate path.

### Finding B — Repair Gap guard compares the wrong truth sets

The forward guard currently compares:

- all matching `kpis` rows from a direct query
- against `propagatedScopeIds`, which only contains rows propagated in the current click.

Relevant lines:

- `src/pages/admin/OrgKpiDataEntry.tsx:1017-1021`
- `src/pages/admin/OrgKpiDataEntry.tsx:1136-1171`

This misclassifies already-propagated or reviewer-locked rows as “missed,” because those rows correctly return `propagatedCount = 0` in the current click.

**RCA:** current-click success count is being treated as total propagation truth. The authoritative truth should include snapshot-propagated employees and employees past `kra_set`.

### Finding C — Skip reason rules conflict

Policy says backend propagation can return `not_authorized`:

- `POLICY.md:3744-3748`

But the canonical benign skip set omits it:

- `POLICY.md:3000-3005`
- `src/test/orgKpiPropagationBenignReasons.test.ts:22`

**RCA:** a later authorization hardening rule introduced `not_authorized`, but the toast classification policy/test were not updated. This creates false destructive errors and bad repair guidance.

### Finding D — Snapshot/cache invalidation is incomplete after propagation

Propagation invalidates several query keys, but not the Org KPI snapshot key that feeds:

- `propagatedEmpsByKey`
- `kraSetEmpIdsByKey`
- mapped employee sets.

Relevant lines:

- `src/hooks/usePropagateOrgKpiValue.ts:323-330`
- `src/pages/admin/OrgKpiDataEntry.tsx:1264`

**RCA:** status chips and guard logic depend on snapshot truth, but the snapshot is not consistently refreshed after writes.

### Finding E — POLICY numbering conflicts are real

There are multiple unrelated `§111` and `§112` sections. Examples:

- `POLICY.md:2326` — `§112` menu visibility
- `POLICY.md:2603` — `§112` safety incident schema
- `POLICY.md:3717` — `§112` Org KPI Save → Propagate integrity

**RCA:** repeated policy numbers make cross-references ambiguous. ADRs and tests can cite “POLICY §112” but mean different business rules.

### Finding F — ADR/test drift remains

Examples:

- `docs/adr/ADR-063.md` still contains autosave-era language even though ADR-075 removed autosave.
- Some older tests use local stubs instead of canonical helpers, increasing risk of policy drift.

**RCA:** repeated fixes updated runtime code but did not fully retire or supersede older ADR/test assumptions.

### Finding G — Live data confirms mixed states, not one single failure mode

Read-only backend check on screenshot-like employees showed mixed states:

- Some rows: `org_kpi_values.achieved_value = 0`, `kpis.status = kra_set`, no `review_submissions` row.
- Some rows: already propagated with `review_submissions` present.
- Some rows: approved/frozen.

**RCA:** the UI is handling a mixed card: true pending saved-zero rows, already-propagated rows, and locked rows. The current toast logic collapses these into broad red errors.

## 5. Five Why Analysis

### Problem 1: Saved `0` still reports “not propagated”

1. Why? The untouched-zero guard still fires.
2. Why? It sees `dbAchievedValue !== 0`.
3. Why? In chained Save → Propagate, values are captured before save updates the local DB snapshot.
4. Why? The optimistic `dbAchievedValue` mirror exists only in `performSave()`, not in the direct `handleSaveAndPropagate()` path.
5. Why? Fixes were added incrementally to symptoms, not to a single shared Save → Propagate state transition contract.

Root cause: no single source of truth for “this row was persisted in this action and is safe to propagate.”

### Problem 2: Repair Gap reports already-propagated rows

1. Why? The guard says employees were missed.
2. Why? It compares all matching employee KPIs against only current-click propagation successes.
3. Why? Already-propagated / reviewer-locked rows return skip counts, not propagation successes.
4. Why? The guard does not consult snapshot truth before declaring a gap.
5. Why? The guard was added as a safety net after half-propagation incidents, but later benign-skip policies were not integrated into it.

Root cause: forward guard uses an incomplete denominator/comparison set.

### Problem 3: Policies keep conflicting

1. Why? Org KPI fixes reference POLICY sections inconsistently.
2. Why? `§111` / `§112` numbers are reused for unrelated modules.
3. Why? Later patches appended new policy blocks without unique namespaces.
4. Why? Regression tests often copied local predicates instead of importing canonical helpers.
5. Why? Documentation updates were treated as release notes, not as an enforceable rule registry.

Root cause: policy namespace drift and duplicated business-rule predicates.

## 6. Step-by-step Resolution Plan

### Step 1 — Establish one Org KPI propagation contract

Create or update a small shared pure helper for Org KPI propagation decisions:

- `isSavedZeroSafeToPropagate(row)`
- `classifyPropagationSkip(reason)`
- `derivePropagationGapStatus(...)`

Expected rules:

- saved `0` is valid when `dbAchievedValue === 0` OR the same save transaction confirms persistence.
- local-only `0` remains blocked.
- `not_in_kra_set`, `reviewer_locked`, `no_target_rows`, `approved_immutable` are non-retry/benign or protected-state skips.
- `not_authorized` gets a clear authorization message, not Repair Gap.
- true `kpi_not_found` / race conditions remain destructive.

Verification:
- Unit tests for every skip reason.
- Tests for saved zero vs unsaved zero.

### Step 2 — Fix chained Save → Propagate state handoff

Update the direct `handleSaveAndPropagate()` path so the values passed to propagation reflect rows successfully persisted by `handleCardSave()`.

Minimal safe approach:

- Have `handleCardSave()` return the persisted scope ids and achieved values.
- Before the propagation loop, treat those returned rows as DB-confirmed for this action.
- Do not rely only on pre-save `dbAchievedValue` from `getValues()`.

Verification:
- Test: fresh row with local `0`, click Save → Propagate, should not trigger untouched-zero skip.
- Test: row with visible `0` but save persisted zero rows should abort before propagation.

### Step 3 — Repair the half-propagation forward guard

Change the Repair Gap guard to compute “missed” as:

```text
mapped employees
minus current-click propagated employees
minus already-propagated snapshot employees
minus employees already past kra_set / reviewer-locked
minus explicitly client-skipped rows with user-facing explanation
minus authorized/visibility-protected skips with correct message
```

Do not flag rows already proven by snapshot truth.

Verification:
- Test: 36 already propagated / reviewer-locked rows should show no red Repair Gap toast.
- Test: truly missing `review_submissions` for visible `kra_set` employees still shows Repair Gap.

### Step 4 — Refresh all Org KPI read models after save/propagate

After save/propagate, invalidate/refetch:

- `org-kpi-values`
- `org-kpi-submission-fallback`
- `org-level-kpis-with-employees`
- relevant KPI/review-submission keys already present.

Verification:
- Status chips update without manual refresh.
- Header counts match row pills immediately after propagation.

### Step 5 — Update UI messages

Replace ambiguous or stale red toasts with state-specific messages:

- Unsaved zero: “0 has not been saved yet. Click Save, then Propagate.”
- Saved zero but blocked: should not occur; treat as bug path.
- Already propagated: neutral informational toast.
- Not authorized: “Some mapped employees are outside your data-owner authorization. Ask an Admin or assigned Data Owner.”
- True gap: keep Repair Gap button guidance.

Verification:
- Tests assert no autosave wording remains in source, ADR, and policy.

### Step 6 — Policy/rule cleanup

Update `POLICY.md` and ADR notes:

- Add a uniquely named Org KPI propagation section/anchor, e.g. `§ORG-KPI-PROPAGATION`.
- Mark old duplicate `§111` / `§112` cross-references as superseded where practical.
- Update ADR-063 with an explicit supersession note by ADR-075 and the new Org KPI propagation policy.
- Add `not_authorized` classification rule.

Verification:
- Static test or doc scan to prevent new “wait for autosave” Org KPI copy.
- Static test for duplicate Org KPI policy references if feasible.

### Step 7 — Test coverage upgrade

Add/extend tests for:

1. Fresh saved `0` propagates in chained Save → Propagate.
2. Unsaved/local-only `0` is blocked.
3. Partial save aborts propagation.
4. Already-propagated rows do not trigger Repair Gap.
5. `not_authorized` gets authorization messaging, not mismatch/repair wording.
6. Snapshot query key invalidation includes Org KPI snapshot.
7. No autosave wording remains in Org KPI UI/policy/ADR.

## 7. UI Changes

### Exact Location
- `/admin/org-kpi-data`
- Scoped Org KPI card rows and Propagate toasts.

### Visual Changes
- No layout redesign.
- Toast copy changes only.
- Existing status pills remain.
- Repair Gap toast appears only for true visible gaps.

### Interaction Impact
- Saved `0` can be propagated without retyping.
- If save fails/partially persists, Propagate remains blocked with explicit error.
- Already propagated/reviewer-locked rows show informational feedback instead of red errors.

### Responsiveness
- No mobile/desktop layout changes.
- Existing buttons and tables remain unchanged.

## 8. Implementation

Not Applicable in this plan response. Implementation will follow after approval.

## 9. Tests

Planned tests:

- Unit tests for shared propagation helper.
- Regression tests for Save → Propagate zero handoff.
- Static tests for query invalidation and forbidden autosave wording.
- Toast classification tests for `not_authorized`, `approved_immutable`, `reviewer_locked`, `no_target_rows`.

## 10. DOCUMENTATION.md updates

Planned:

- Add a new version entry documenting:
  - chained saved-zero fix
  - Repair Gap guard correction
  - skip-reason classification update
  - snapshot invalidation update
  - no schema/data-loss impact.

## 11. POLICY.md updates

Planned:

- Add/supersede an Org KPI propagation policy anchor.
- Resolve `not_authorized` classification conflict.
- Clarify saved-zero contract.
- Clarify Repair Gap denominator rules.
- Mark autosave-era ADR wording as superseded.

## 12. Post-implementation notes

Rollback strategy:

- Frontend-only parts can be reverted file-by-file.
- If no migration is used, no data rollback needed.
- If policy-only docs are updated, rollback is documentation-only.

Final recommendation:

- Fix this as a policy/logic consolidation, not another one-line toast change. The repeated recurrence is caused by fragmented predicates and conflicting rules, not a single missing condition.