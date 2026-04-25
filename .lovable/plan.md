## Plan — Fix TNI Detection Logic (align with KPI definition)

### Goal
Make `detect_training_needs_for_period` (and the TNI Report) accurately reflect *real* skill/knowledge gaps from PMS data, by separating **compliance failures** (auto-zero non-submissions) from **training needs**. Training delivery tracking stays out of scope (handled by LMS).

---

### Root cause
Current detection treats *every* `final_score < threshold` (including auto-zero compliance penalties) as a skill gap. This pollutes the TNI Report — HR can't tell whether a low score means "needs training" or "didn't submit on time."

---

### Changes

**1. Schema — `training_needs` table (migration)**
Extend the `tni_gap_type` enum:
```
'skill' | 'knowledge' | 'behavior' | 'compliance'   ← NEW
```
No new columns. The `gap_type = 'compliance'` value is the discriminator.

**2. RPC — `detect_training_needs_for_period` (migration)**
Two-pass insert in one function:

- **Pass A — Compliance gaps**: rows where the low score came from auto-zero / non-submission. Detect via:
  - `submissions.self_score IS NULL` AND `final_score = 0`, OR
  - `audit_logs` shows `auto_advance_overdue` / `bulk_zero_score` performer for that KPI.
  → insert with `gap_type='compliance'`, `priority='high'`, `training_recommendation='Auto-flagged: non-submission / compliance penalty. No training required.'`

- **Pass B — Genuine skill gaps**: low score *with* a self-submission present (employee tried, scored low).
  → insert with `gap_type='skill'`, priority by score band (existing logic).

Both passes keep the existing dedup guard (`NOT EXISTS … kpi_id`).

**3. Hook — `src/hooks/useTNI.ts`**
- Add `'compliance'` to `TNIGapType` union.
- `useTNISummary` returns extra fields: `complianceGaps`, `genuineTrainingNeeds`.
- `useTrainingNeeds` accepts an optional `gapType` filter.

**4. UI — `src/pages/reports/TNIReport.tsx`**
- New summary card: **Compliance Gaps** (separate from Total Training Needs).
- "Total Training Needs" card now excludes compliance rows.
- Add a **Gap Type filter** (All / Training / Compliance) above the Individual tab.
- Individual table: add "Gap Type" badge column (skill = blue, compliance = amber).
- Excel export: existing `Gap Type` column already present — values will now reflect the split.

**5. Detection trigger UI**
In the "Detect TNI" button toast, show: *"Identified X training needs and Y compliance gaps."*

**6. Tests — `src/test/bugBountyFixes.test.ts`**
Add **BUG-025** — `detectTrainingNeedsCompliance.test.ts`:
- Auto-zero KPI (no self-submission) → inserted with `gap_type='compliance'`.
- Self-submitted low score (1.5) → inserted with `gap_type='skill'`.
- Already-detected KPI → not re-inserted.
- Summary hook splits totals correctly.

**7. Docs**
- `DOCUMENTATION.md` → bump to **v2.66.7.27**, document the compliance/skill split and detection rules.
- `POLICY.md` → add **§98**: *"TNI detection must distinguish discipline failures (auto-zero / non-submission) from genuine skill gaps. Compliance gaps are tracked for HR visibility but are not eligible for training plans; training delivery and effectiveness are tracked in the LMS module (out of PMS scope)."*

---

### Risk & Impact
| Area | Impact |
|------|--------|
| Data | New enum value (additive); existing rows unchanged. Re-running detection is idempotent. |
| Workflow | None — TNI is read-only consolidation. |
| UI/UX | One new card + one filter. Existing layout preserved. |
| LMS integration | Clean handoff — TNI exposes `gap_type='skill'` rows as training-eligible. |
| Regression | Low — RPC stays backward-compatible (same signature, same return). |

### Out of Scope
- Training delivery / attendance / effectiveness (LMS).
- Auto-scoring the HR person's KPI (user declined).
- New training_records table.
- Changes to PIP workflow.

### Optional follow-up (not in this build)
A "Re-classify existing rows" admin action that retroactively converts already-detected auto-zero rows to `gap_type='compliance'` — flag for after this lands if HR wants historical cleanup.
