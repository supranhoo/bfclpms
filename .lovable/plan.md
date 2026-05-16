## What the data says (April 2026, your 84-person HR PMS roster, 1090 KPIs)

| Bucket | Count |
|---|---|
| Status structurally past `hr_pms_review` (`audit` / `management_review` / `approved`) | **116** |
| Has `hr_pms_score` signature | 113 (all within the 116) |
| `is_na` + past HR PMS | 3 |
| **Union — "passed HR PMS by any process"** | **116** |
| Currently AT `hr_pms_review` (in stage) | 448 |
| Currently pre-HR-PMS (`kra_set` / `self_review` / `manager_check` / `skip_level_check`) | 526 |

The tile is doing exactly what you asked it to do: it shows every roster KPI that has moved past the HR PMS stage by ANY path (HR PMS signature, N/A approval past HR PMS, or structural advancement). The number 116 is mathematically correct — there are no hidden KPIs that "passed HR PMS" but aren't counted.

## So why does it feel wrong

Because of the zero-score policy. The system has 141 zero-scored KPIs scattered across `self_review` (30), `manager_check` (60), `skip_level_check` (1), `hr_pms_review` (31), `audit` (9), and `management_review` (11) — **the ones that "should" have been auto-zeroed and pushed all the way to approved are stuck at intermediate stages**. The current bulk-zero edge function (`bulk-zero-score-non-submitters`) only drains KPIs at `kra_set` and `self_review` — it ignores stuck KPIs at later stages. So once a manager / skip-level / HR PMS reviewer fails to act, the KPI sits there forever, never reaching "Reviewed by HR PMS".

That's the real gap. Fixing the tile won't help — we need to actually move those stuck KPIs through.

## Plan

### Step 1 — Confirm the tile is correct (no code change)

- Strip the diagnostic `useEffect` in `EmployeeSelectorGrid.tsx` (added in v2.66.11.16).
- Document in `DOCUMENTATION.md` v2.66.11.17 that 116 is the verified mathematical truth for April 2026 (table above).
- Add `src/test/hrPmsReviewedTileVsList.test.ts` asserting the parity invariant: `tile.stat3 = Σ visible badge3` when `statusFilter='reviewed'`. This locks the tile correctness regardless of any future workflow churn.

### Step 2 — Extend bulk-zero engine to drain stuck KPIs at later stages

Today `supabase/functions/bulk-zero-score-non-submitters/index.ts` filters at L157 / L401:
```ts
.in("status", ["kra_set", "self_review"])
```

Extend it to a configurable set of "stuck-at" stages, defaulting to ALL pre-terminal stages a Data Owner / Admin chooses for that run. Specifically:

- New optional param `stuck_at_stages: string[]` (default `["kra_set", "self_review"]`, allowed values include `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`).
- Same "set 0 across all stages → status='approved' → audit log" cascade applies, regardless of starting stage.
- Scoring honours the existing `submissionData.hr_pms_score = 0` block when stages contain `hr_pms_review` — so a KPI zero-advanced from `manager_check` will pick up an HR PMS signature on the way out.
- Audit reason field gets the new starting stage (`stuck_at_manager_check`, etc.) so HR can see WHY each KPI was auto-closed.

Admin UI (`src/components/admin/BulkZeroScoreSection.tsx`) gets a multi-select for "Drain KPIs stuck at:" with the existing two stages pre-checked, and the four new stages opt-in with a warning that this closes the KPI on behalf of the reviewer.

### Step 3 — Policy update

- `POLICY.md` — extend the zero-score governance section to declare: "After period lock, Admin / Data Owner MAY drain stuck KPIs from ANY pre-terminal stage (not just self_review). All affected KPIs receive a 0 across the cascade, status=`approved`, and an audit log row tagging the originating stuck stage."
- `mem/features/admin/bulk-zero-scoring-system` — add the new stage set + safeguards (cannot run on an unlocked period; requires explicit confirmation when draining `hr_pms_review` / `audit` / `management_review` since those bypass a human reviewer).

### Step 4 — Tests & mock data

- Unit test for the edge function dispatch path covering one stuck KPI per stage (5 cases).
- Regression test: after a simulated drain of the 141 April KPIs, HR PMS Reviewed tile would rise from 116 → 257 (116 + 141), matching expectation.
- Mock data fixture seeds one KPI in each stuck stage to drive the test deterministically.

### Step 5 — Documentation

- `DOCUMENTATION.md` v2.66.11.17 — entry covering Steps 1–4, including the 116-is-correct RCA and the extended drain capability.
- Changelog: link the new audit-log reasons so HR / Auditor can trace any zero-closure back to the operator who ran the drain.

## Risk & Impact

- **Data:** Step 1 = read-only. Step 2 = writes that already exist (0-score + status=approved + audit log); the only new dimension is the source stage. Reversible via Rollback Request Management.
- **Workflow:** Draining from `hr_pms_review` / `audit` / `management_review` skips a human reviewer — gated behind an explicit, audited Admin confirmation dialog (per Destructive Action Governance).
- **UI/UX:** No tile shape change. The Reviewed number will go up only when Admin actually runs the extended drain — fully under operator control.
- **Regression:** Low. Locked by parity test (Step 1) + per-stage drain tests (Step 4). Existing two-stage default behaviour is preserved.

## Out of scope

- Automatically running the drain on a cron. Today it's operator-initiated; keeping that explicit until you tell me otherwise.
- Audit Reviewed / Management Reviewed tile parity tests — will be cloned once HR PMS path is proven.
