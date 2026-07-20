
## Symptom
Akbar Ansari (101672) shows **Self Review Pending** with the self form pre-filled and a `Dept: 4` chip on Attendance. Assisted self was already captured by proxy Prabhat Kumar Singh (101757) on 2026-07-12, but the instance is stuck at `pending_self`.

## RCA — evidence from the database (instance `a5f4e3ab-…-3a1e0b24499`)

| Fact | Value |
|---|---|
| `annual_review_instances.overall_status` | `pending_self` |
| `annual_review_responses` (self) | `submitted_at = 2026-07-12 12:05:54`, `is_locked = true`, `weighted_score = 229`, 19 criteria scored + all qualitative answers |
| `annual_review_proxy_submissions` | 1 row: proxy = 223ba922 (Prabhat), employee = 785735e5 (Akbar), selfie captured |
| `annual_review_responses` (dept_head) | draft row with only 3 legacy keys `attendance / quality / safety` — orphan keys from the old template (source of the `Dept: 4` chip) |
| Enabled stages | `[self, dept_head, bu_head]` — no manager / skip |

## 5-Why

1. **Why is the form still shown as pending?** Instance `overall_status` is `pending_self`.
2. **Why, when the self response is locked and submitted?** The assisted-submit RPC wrote the response and proxy audit row but did not advance `overall_status` to the next enabled stage (`pending_dept`).
3. **Why did the advance step not run?** The path that advances the instance was gated on an earlier version of the guard (ADR-114/115) that checked `weighted_score` on the *response row at call time*. For this row `weighted_score` was still `NULL` at the moment the advance step ran (it was computed and written later, in the same transaction retry that also flipped `is_locked=true`). The guard treated the response as "not scored yet" and short-circuited without updating the instance.
4. **Why was the score written but the status not?** The self-submit path is two writes (`responses` upsert, then `instances` status update). The second write is inside the same RPC but conditional on the guard result read in step 3; when the guard rejected, only the response persisted.
5. **Why did this pass QA?** The regression matrix from ADR-115 checks the *proxy* submit path (Awadhesh/HR proxy) but not the *authorized_proxy* path used by department heads doing assisted self-submits; both call the same RPC, but the guard's read-your-own-write timing differs because dept-head proxy runs under a different RLS role and hits an extra `SECURITY DEFINER` hop.

## Fix plan

### Step 1 — Data repair for Akbar (verifiable)
- Advance instance `a5f4e3ab-…` from `pending_self` → `pending_dept` (next enabled stage after `self`, skipping the null manager/skip slots per existing chain resolver).
- Set `criteria_weighted_score = 229` and `total_score` from the locked self response (SSOT: universal-scoring-logic).
- Delete the orphan `dept_head` draft row (keys `attendance/quality/safety` map to no criterion in the current template `408ae1b3-…`) — the dept head will start fresh on the current template. Log the delete in `annual_review_reviewer_remap_audit_2026_07`.
- Verification: re-read the instance → `overall_status = pending_dept`; re-read responses → exactly one row per stage, no orphan keys; UI opens as Dept Head editable, chip disappears.

### Step 2 — System-wide sweep
- Query `pending_self` instances with a `submitted_at IS NOT NULL AND is_locked = true` self response. Today the count is **1** (Akbar). Rerun after the guard fix and confirm 0.

### Step 3 — Guard fix (POLICY §AR-PROXY-SELF-ADVANCE-ATOMIC, ADR-123)
In the assisted self-submit RPC:
- Compute `weighted_score` **before** the guard check (same transaction) so the guard reads a consistent value.
- Replace the `weighted_score IS NOT NULL` guard with the ADR-115 helper `hasAnyNumericCriterion(criteria_scores)` — matches the client dialog guard, no read-your-own-write dependency.
- Wrap "lock response" + "advance instance status" in a single `WITH ... UPDATE` CTE so either both succeed or neither does.

### Step 4 — Regression tests
- `authorizedProxySelfAdvance.test.ts`: proxy `authorized_proxy` role submits assisted self → instance advances to `pending_dept` even when the response `weighted_score` is computed inline.
- Extend `assistedSubmitGuard.test.ts` to assert `overall_status` changes, not just that the response is locked.
- SQL regression: no rows where `overall_status='pending_self'` AND self response `is_locked=true AND submitted_at IS NOT NULL`.

### Step 5 — Docs
- `docs/adr/ADR-123.md` — atomic proxy-self advance.
- POLICY.md — add §AR-PROXY-SELF-ADVANCE-ATOMIC.
- CHANGELOG entry `v2.66.123`.

## Risk & rollback
- **Data risk:** touches 1 instance + deletes 1 orphan draft row (archived to audit table before delete).
- **RPC risk:** guard change is additive (accepts a strict superset of the old condition) — no in-flight submissions can regress.
- **Rollback:** restore `overall_status='pending_self'` and re-insert the archived dept_head draft from the audit row; revert RPC migration.

## Not applicable
- UI changes (server-side + data repair only; the existing detail page already renders the correct stage once `overall_status` advances).
- Pagination (single-row repair; sweep uses a bounded query).
