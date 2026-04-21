

## Plan — Close the 3 Process Gaps in Org KPI Data Entry

You've identified three real gaps the audit didn't fully cover. They map cleanly onto the existing spec (`docs/specs/org-kpi-data-entry-spec.md`) and roadmap (`docs/specs/org-kpi-fix-roadmap.md`), but they need to be inserted in the right order so they don't fight the in-flight RPC patch (Step 3).

### Gap → Fix mapping

| # | Gap | Bucket signature | Where it slots in roadmap | Phase |
|---|---|---|---|---|
| 1 | "Stuck in the middle" revision flow — reviewer rejects, DO not notified, OKV not flagged | New: **J** — rejected employee KPI but OKV still `propagated` | New Step 7 | Phase B |
| 2 | Lack of transactional atomicity in propagation RPC | Buckets B + F (root cause) | Folds into existing **Step 3** (RPC patch) | Phase A |
| 3 | "New hire" ghost assignment — late-joiner gets `kpis` row but no submission | New: **K** — `kpis.is_org_level=true, status='kra_set'` created AFTER OKV reached `propagated` | New Step 8 | Phase B |

---

### Phase A — Foundation (must ship first, in order)

**A1. Run existing repair tools** *(roadmap Step 1 — zero code, ~5 min admin click)*
Clears 14 Bucket B + 6 Bucket C historical rows. Already in roadmap.

**A2. Add Bucket F repair pass** *(roadmap Step 2 — ~1h)*
Already in roadmap. Repairs the 87 silently-propagated definitions.

**A3. Patch `propagate_org_kpi_value` RPC — now WITH atomicity** *(roadmap Step 3, expanded)*
The original Step 3 added per-row `ROW_COUNT` checks and a `skipped[]` return. **Gap #2 expands it** to wrap the entire per-employee loop in a single DB transaction with these semantics:

- Open transaction at function entry (PL/pgSQL functions already run in an implicit transaction — the explicit guarantee is that we don't `COMMIT` mid-loop and we use a single `EXCEPTION WHEN OTHERS` block to roll back the whole batch).
- For each employee: attempt status advance + submission insert + audit log. If any single employee raises (RLS denial, constraint violation, FK miss), capture the error into `v_failed[]` and **decide policy**:
  - **Default: strict mode** — re-raise to abort the whole batch. OKV stays `draft`. Caller sees the error and can retry.
  - **Opt-in: lenient mode** (boolean param `p_continue_on_error default false`) — collect failures, finish remaining employees, return `{propagated_count, skipped[], failed[]}` and only advance OKV to `propagated` if `failed[] is empty`.
- Add a `SAVEPOINT` per employee in lenient mode so one bad row doesn't poison the rest.
- Audit log `PROPAGATION_ATOMIC_ABORT` action when strict mode rolls back, with full failure detail.

This kills the root cause of Buckets B and F simultaneously. Without atomicity, the Step 2 repair tool has to keep running forever.

**A4. Pre-flight propagation preview** *(roadmap Step 5)*
Now reads the lenient-mode preview path of the patched RPC. UI shows the same `{will_advance, will_skip, will_fail}` breakdown the live call would produce.

---

### Phase B — Process gaps (after Phase A is stable)

**B1. New Step 7 — "Request Revision" reviewer action (Gap #1)**

**Behaviour**
- When a reviewer (Manager / Skip-Level / Auditor / Management) opens an Org KPI's review and the issue is *with the source value* (not the score they'd give), they can click **"Request Revision from Data Owner"** instead of approve/send-back.
- This action:
  1. Sets the per-employee `kpis.status` back to `kra_set` (clears their submission scores via existing send-back governance).
  2. Sets `org_kpi_values.status` from `propagated` back to `draft` and writes `revision_reason`, `revision_requested_by`, `revision_requested_at` to a new metadata column (or extends `org_kpi_values.metadata jsonb`).
  3. Cascade-clears: every other employee for the same OKV who is still in early stages (≤ self_review) is also rolled back to `kra_set` (since the source value will change for everyone). Employees past `manager_check` get a notification but stay put — their score will stand against the old value, with a flag.
  4. Notifies all data owners of that KPI (`org_kpi_data_owners`) via the existing notification + email pipeline (new event type `org_kpi_revision_requested`).
  5. Audit log: `ORG_KPI_REVISION_REQUESTED` on both the OKV (parent) and the affected `kpis` rows (children).

**New bucket J detection** in census:
`org_kpi_values.status='propagated'` AND any child `kpis.status='kra_set'` with audit log `STATUS_REJECTED` after the OKV `propagated_at`.
The new action makes this state legitimate (returns OKV to `draft`); detection is for catching cases where a reviewer used the old send-back path without triggering revision.

**Files**
- New migration: extend `org_kpi_values` with `last_revision_reason text`, `last_revision_requested_by uuid`, `last_revision_requested_at timestamptz`. Or use existing `metadata` jsonb if present.
- New RPC: `request_org_kpi_revision(p_kpi_id uuid, p_reason text)` — handles all 5 steps above atomically.
- New hook: `useRequestOrgKpiRevision.ts`.
- UI: new button in `UnifiedScorecard` reviewer panel for org-level KPIs only (gated by `kpis.is_org_level=true`).
- New email template: `org_kpi_revision_requested` (per-template-email-scheduling).
- New notification type: `org_kpi_revision_requested` (immediate dispatch — DO needs to act).
- Cascade governance: extend `mem://features/review/send-back-data-preservation` to cover the new cascade rule.

**B2. New Step 8 — Late-joiner auto-pull trigger (Gap #3)**

**Behaviour**
- Add a DB trigger `trg_autopull_propagated_org_kpi` on `kpis` AFTER INSERT.
- When a new row is inserted with `is_org_level=true` AND `status='kra_set'`:
  1. Look up the matching OKV using the natural key (category_id, nk(kra_name), nk(kpi_name), review_period, review_year).
  2. If OKV exists AND `OKV.status IN ('propagated', 'approved')` AND scope matches (org-wide, or matching department, or matching employee per `org_kpi_values.department_id`/`employee_id`):
     - Insert a `review_submissions` row pre-filled with the OKV's `achieved_value`, computed `self_score`/`self_rating` from KPI thresholds.
     - Advance `kpis.status` to `self_review`.
     - Audit log: `ORG_KPI_AUTOPULLED_FOR_LATE_JOINER` with `source_okv_id` and `joined_after_propagation_at` metadata.
  3. If OKV exists but is in `draft` (DO hasn't propagated yet) → leave alone, the next propagation will pick them up.
- Notification to the new employee: standard `kpi_assigned` (existing).
- Notification to data owner: optional FYI `late_joiner_autopulled` so DO knows the headcount changed.

**New bucket K detection** in census:
`kpis.is_org_level=true, status='kra_set'` AND OKV with matching natural key has `status IN ('propagated', 'approved')` AND `kpis.created_at > OKV.propagated_at`.
A repair pass converts these via the same auto-pull logic, for any historical rows created before the trigger ships.

**Edge cases handled**
- Scope mismatch (e.g., new employee is in dept X but OKV scoped to dept Y) → no auto-pull, KPI stays `kra_set` correctly.
- Multiple OKV rows match (org-wide + dept-specific) → prefer the most-specific scope: employee → department → org-wide.
- OKV value is `is_na=true` → propagate the N/A flag too.
- Trigger fires on rollover-cloned rows too (handled — same signature). This means rollover-into-already-propagated-period auto-fills, which is the desired behaviour.

**Files**
- New migration: trigger function + trigger.
- One-shot repair script (run once after deployment): scan + auto-pull for existing late-joiners, audit-logged with `tool='late_joiner_backfill'`.
- New row in `useRepairOrphanedPropagations` UI for "Repair Late-Joiner Org KPIs" with dry-run.
- Update spec §4 step 5 to note the post-propagation continuous fill behaviour.

---

### Phase C — Documentation, memory, regression tests (per workspace SSOT rules)

After Phase A and Phase B each ship:

1. Update `docs/specs/org-kpi-data-entry-spec.md`:
   - §3 state machine: add `draft ← propagated (revision requested)` transition.
   - §4 happy-path: insert step 5.5 "Continuous late-joiner fill".
   - §5 UI surface map: add Reviewer Revision button.
   - §6 classification: add buckets J + K.
   - §9 known gaps: mark resolved.
   - Version History entry: v2.66.x.
2. Update `docs/specs/org-kpi-fix-roadmap.md`: mark Steps 1-3 done, add Steps 7-8.
3. Update `DOCUMENTATION.md` change log.
4. Memory updates:
   - `mem://features/admin/org-kpi-management-suite` — add revision flow + auto-pull.
   - `mem://features/admin/data-repair-engine` — add bucket J + K passes.
   - `mem://features/review/send-back-data-preservation` — add cascade rule for revision request.
   - `mem://architecture/notification-and-dispatch-engine` — add `org_kpi_revision_requested` event.
5. Mock data + unit tests per workspace rule:
   - RPC atomic abort path (force RLS denial mid-loop, assert full rollback).
   - Revision request cascade (3 employees: one in self_review, one in manager_check, one in audit — assert correct rollback behaviour).
   - Late-joiner auto-pull (4 scope variants).

---

### Risk & Impact

**Phase A (Steps 1-3 + atomicity)**
- *Data:* Step 1 + 2 are repair-only (audit-logged, reversible). Step 3 keeps the `_v1` overload behind a feature flag so the new RPC can be switched off instantly.
- *Workflow:* No actor-facing change. The RPC is internal. The atomic mode adds a `failed[]` array — UI must handle it (toast: "X failed, see details").
- *Regression risk:* Medium for Step 3. Mitigation: feature flag, parallel deploy of `_v1`, regression test set covering 12 scenarios from the audit's failure-mode table.

**Phase B1 (Revision flow)**
- *Data:* Adds 3 columns or 1 jsonb field to `org_kpi_values`. Net new RPC — no overlap with existing send-back. Cascade-clear is reversible via existing Step Back tool.
- *Workflow:* New reviewer action visible only on `is_org_level=true` KPIs. Existing send-back path unchanged.
- *Regression risk:* Low — additive feature. Most risk is the cascade rule misfiring; mitigation is the `≤ self_review` cutoff and explicit dry-run preview.

**Phase B2 (Late-joiner trigger)**
- *Data:* Trigger writes `review_submissions` rows + advances `kpis.status`. Audit-logged. Reversible per row via Step Back.
- *Workflow:* New employees onboarded mid-period get pre-filled scores instead of empty `kra_set` — matches the intent of "Propagate".
- *Regression risk:* Medium — trigger fires on every `kpis` insert org-wide. Mitigation: trigger body short-circuits early on `is_org_level=false`, and we ship behind a setting `app_settings.enable_org_kpi_autopull` defaulted to `false` for one release before enabling.

---

### Execution order recap

```
A1 → A2 → A3 (RPC + atomicity) → A4 (preview)
                                    │
                                    ├──► B1 (revision flow)
                                    └──► B2 (late-joiner trigger)
                                              │
                                              └──► Phase C (docs, memory, tests)
```

A1 and A2 can be done by an admin click + small PR. A3 is the largest single change. B1 and B2 are independent of each other once A3 is stable.

### What this loop will NOT do
- No code yet. This is a sequenced implementation plan.
- After approval, recommended first execution: **A1 (admin click)**, then I write the migration + caller for A3 (folding atomicity into the existing Step 3).

