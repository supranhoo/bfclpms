

## RCA — "Propagated value showing incorrectly" for Sajid Raza

### What the screenshots actually show
1. **Org KPI Data Entry card** ("Achieve 3*100 TPD Power Generation target", March 2026):
   - Header pill = **Propagated** ✓
   - Sajid's row: **Achieved = 0**, Rating = **"Not Achieved"** (red), Remark = "Details attached As data shared by Umesh Mehta ji"
   - "Prev (Feb 2026): 5"
2. **Sajid's Dashboard** (March 2026):
   - "Achieve organization's production target" → Achieved = **33.25%**, but Self/Auditor/Mgmt/Final = **—**, status = **KRA Set**
   - Weighted Score = 0.0 / 0

### Root cause — two distinct bugs, not one

#### Bug A — Propagate accepts and silently writes 0
Audit trail (`org_kpi_data_entry_logs`) for this KPI shows **6 propagate events**, every one with `new_value=0`. The data owner (Biswajit Sahoo) clicked Propagate without typing an achieved value. The current Propagate handler treats "blank field" as "achieved=0", so:
- A fresh employee-scope row was created for Sajid with `achieved_value=0, status=propagated`
- A child `review_submissions` row was created with `self_score=0`, status `self_review`, rating "Not Achieved"

The orphan row `bc179d72…` (employee_id=null, achieved=5) is **legacy noise** from before the KPI was switched to employee scope. It is not bound to Sajid and the badge logic now correctly ignores it (v2.65.3 fix is working).

The actual bug here is that the Propagate path treats an **empty input** as a valid `0`, instead of blocking propagation the way it already blocks fully-blank rows.

Looking at `src/pages/admin/OrgKpiDataEntry.tsx` `handleCardSaveAndPropagate` (lines 570–615): the existing `isMissingData` guard only fires when **all** scoped rows have neither a value nor `is_na`. If a single scoped row has an empty `achievedValue` and `isNa=false`, it is currently filtered out at line 602 (`if (sv.achievedValue === null && !sv.isNa) continue;`) — meaning it gets **silently skipped**, not propagated as 0.

So how did 0 land in the DB? Two possible paths, listed without picking silently:

- **Path 1**: The owner typed `0` (or the input bound to `''` was coerced to `0` in `OrgKpiScopedEntryTable`). I need to confirm by reading `OrgKpiScopedEntryTable`'s onChange before fixing.
- **Path 2**: A `Save` (without propagate) was fired earlier with `achievedValue=0`, then Propagate replayed that DB value. The audit log shows alternating `created`/`propagated` pairs — consistent with this.

I will not patch blindly. The fix needs to address whichever path is actually coercing `''` → `0`.

#### Bug B — Dashboard shows phantom "Achieved 33.25%" with no submission
For the **second** KPI ("Achieve production target from 3X100 TPD") the DB confirms:
- `kpis` row exists for Sajid: `status='kra_set'`, **no `review_submissions` row at all** (`sub_id` is null in the join)
- `org_kpi_values` has a separate row `d6bcb1a4…`: `achieved_value=33.25, status='approved', employee_id=Sajid, updated_at=2026-04-05`

The dashboard reads from `org_kpi_values` as a **fallback** for the "Achieved" column (per existing `kpi-journey-data-fallbacks` policy). So the user sees "33.25%" achievement next to a "KRA Set" status and dashed scores — visually contradictory.

The propagation that wrote 33.25 on 2026-04-05 either:
- Pre-dates the current `kpis` row (which is in `kra_set`, untouched)
- Or `propagate_org_kpi_value` RPC failed to upsert the `review_submissions` row at that time, while still upserting `org_kpi_values`

Either way the dashboard is showing data that has no workflow record behind it. **This is a real visual data-integrity bug**, not just a UX hiccup.

### Assumptions I am explicitly stating
1. Bug A and Bug B are **different bugs** with different fixes; they need separate RCAs.
2. I will not change RLS, schema, the `propagate_org_kpi_value` RPC, or the dashboard fallback policy.
3. I do not yet know whether Bug A's `0` came from the input coercion (Path 1) or a stale DB write (Path 2). I need to read `OrgKpiScopedEntryTable.tsx` before patching, otherwise I'll be guessing.
4. For Bug B, the *minimum* honest fix is to make the dashboard not show an "Achieved" value when the matching `review_submissions` row does not exist for that `kpi.id`. The deeper fix (re-create the submission row) is data repair and out of scope.

### Alternatives I considered and rejected
- **Auto-create a `review_submissions` row from the orphan `org_kpi_values`** when the dashboard renders. Rejected — that's silent data fabrication.
- **Delete the orphan org-scope row `bc179d72…` for Sajid**. Rejected — historical, separate cleanup decision.
- **Force every Propagate click to require a non-empty value.** Will do this only if the input-coercion path turns out to be the cause. If it's the DB-replay path, the fix lives elsewhere.

---

## Plan — minimum-code fix, two narrow patches

### Step 1 (investigation, no code yet)
Read `src/components/admin/OrgKpiScopedEntryTable.tsx` and confirm whether the achieved-value input emits `0` or `null` when cleared. Also confirm the row's `Save` path can persist `0` without an explicit user keystroke.

This is **one tool read**, not a redesign.

### Step 2 — Bug A patch (Org KPI Data Entry: silent-zero propagate)
Two possible patches, one will be picked based on Step 1:

- **If Path 1** (input coerces `''`→`0`): change the input/onChange in `OrgKpiScopedEntryTable.tsx` to emit `null` for empty strings. ~1 line.
- **If Path 2** (DB has stale `0`): tighten `handleCardSaveAndPropagate`'s missing-data check to also block propagation when the scoped row's `achievedValue === 0` **and** the user did not explicitly enter a value this session. Concretely: add a per-row "touched" flag in `OrgKpiEntryCard` and skip-with-warning untouched rows in `handleCardSaveAndPropagate`. ~10 lines.

I will pick exactly one of these after Step 1. No speculative both-fixes.

### Step 3 — Bug B patch (dashboard phantom achievement)
In the dashboard "KPI Details" row builder, when there is **no `review_submissions` row** for the `kpi.id`, do **not** display the `org_kpi_values.achieved_value` as the "Achieved" cell. Show `—` instead, matching the score columns.

This is one conditional in the row mapper — likely 2–3 lines. File to be confirmed during Step 1 (one of: `KpiDetailsTable.tsx`, the dashboard's row builder, or the KPI-journey hook).

### Out of scope (explicitly)
- No DB cleanup of orphan `org_kpi_values` rows.
- No change to `propagate_org_kpi_value` RPC.
- No change to RLS or schema.
- No change to badge logic (already fixed in v2.65.3).
- No change to Sajid's existing data; only the rendering and the input behaviour change.
- No new abstractions, no generalised "validation framework", no flags table.

### Files that may change
| File | Likely change |
|---|---|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | (Path 1 only) coerce empty string → `null` in onChange. ~1 line. |
| `src/components/admin/OrgKpiEntryCard.tsx` | (Path 2 only) per-row touched flag; pass through to propagate handler. ~6 lines. |
| `src/pages/admin/OrgKpiDataEntry.tsx` | (Path 2 only) skip untouched rows in `handleCardSaveAndPropagate`. ~4 lines. |
| Dashboard KPI row builder (TBD) | Hide `org_kpi_values` achieved fallback when no `review_submissions` row exists. ~3 lines. |
| `DOCUMENTATION.md` | Append v2.65.4 note: silent-zero propagate guard + dashboard achievement fallback gating. |

### Risk & Impact
- **Data:** none — read/UI behaviour only.
- **Workflow:** Propagate will refuse to silently write 0 from an untouched row. This is intentional and matches user expectation.
- **UI/UX:** Dashboard will show `—` for achievement in cases where the workflow row never existed. Honest, non-contradictory.
- **Regression risk:** low. Both patches are local and gated by precise conditions (untouched/empty row; missing submission).
- **Mitigation:** before coding, run Step 1 to pick the correct Path. Do not patch both.

### Why this is the simplest correct answer
- It addresses the actual two distinct misbehaviours visible in the screenshots.
- It refuses to silently fabricate data on either side (entry or display).
- Each patch is single-digit lines.
- No new infra, no new abstractions, no schema changes.
- A senior engineer would not call this overcomplicated — it's one read + one of two small patches + one display gate.

