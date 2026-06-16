## Goal
In the Annual Review **Template Editor** (`src/components/annual-review/TemplateEditorDialog.tsx`), guarantee that a template's combined weightage (System Scores + Criteria) equals **exactly 100%** before it can be saved as **Active**. Drafts (Inactive) may still be saved with any total so authors can work-in-progress.

## Current Behaviour (deficiency)
- `combined = systemWeight + criteriaWeight` is computed and a destructive Badge shows `— must equal 100%` when off.
- The **Save Template** button is only disabled on `!name || save.isPending` — the weight check is purely cosmetic, so 80% or 120% templates save and reach reviewers.
- No per-row validation; negative numbers and decimals slip through.

## Risk & Impact
- Data: none destructive — adds client-side guard + one extra precondition in the existing save handler. No schema change.
- Workflow: prevents publishing a misweighted template; protects downstream score math in `computeCriteriaScore` / `computeOverallScore`.
- UI: existing Save button gains a disabled state + tooltip; new inline error helpers on weight inputs and a sticky summary line.
- Regression: low — drafts retain today's freedom; only `is_active === true` saves get the new gate.
- Scalability: pure in-memory math over <50 rows. No query/API impact.

## Validation Rules

**On input (per row, both System Scores and Criteria tables):**
1. `weight` must be a finite number, `>= 0`, `<= 100`, max 2 decimals.
2. Highlight the row's weight input with `border-destructive` + helper text when invalid.

**On save:**
3. `name.trim().length > 0` (already enforced).
4. If `isActive === true`:
   - `combined === 100` (use `Math.round(combined * 100) === 10000` to dodge float drift).
   - Every criterion has `weight > 0` (a zero-weight criterion is meaningless once published).
   - At least one criterion exists.
5. If `isActive === false` (Draft): only rule 1 + 3 apply — author can save partial work.

## UI / UX Changes
Location: `TemplateEditorDialog.tsx`.

1. **Sticky summary bar** above the Save button:
   - Pill: `System X% + Criteria Y% = Z%` — emerald when 100, destructive when not.
   - Sub-line lists blockers: `Active templates require weights to total exactly 100% (currently 98%).`
2. **Save button** — `disabled` when active-mode rules fail. Wrap in a `Tooltip` explaining why (so the disabled state is discoverable). Keep enabled in Draft mode.
3. **Second action — "Save as Draft"** — visible only when active-mode validation fails; clicking flips `isActive=false` locally and saves, so authors aren't stuck.
4. **Per-row error** — small `text-destructive text-xs` under the weight input when the row's value is out of range.
5. **Criteria/System tab badges** — small numeric badge on each TabsTrigger showing that section's subtotal; destructive variant when the section's contribution makes the combined off.

## Example Messages
- Summary (invalid): `Combined weight is 96%. Adjust System Scores or Criteria to reach exactly 100% before saving as Active.`
- Save tooltip (disabled): `Cannot save: weights total 102% (must equal 100%). Save as Draft to keep editing.`
- Per-row: `Weight must be between 0 and 100.`
- Zero-criterion guard: `Each criterion must have a weight greater than 0.`
- Empty criteria: `Add at least one criterion before publishing.`
- Success (unchanged): `Template saved`.

## Sample Logic
```ts
const EPS = 0.01;
const round2 = (n: number) => Math.round(n * 100) / 100;

const combined = round2(systemWeight + criteriaWeight);
const weightOk = Math.abs(combined - 100) < EPS;

const rowsValid = [...systemScores, ...criteria].every(
  (r) => Number.isFinite(r.weight) && r.weight >= 0 && r.weight <= 100,
);
const criteriaHaveWeight = criteria.length > 0 && criteria.every((c) => c.weight > 0);

const activeBlockers: string[] = [];
if (!weightOk)            activeBlockers.push(`Total is ${combined}% (must be 100%).`);
if (!rowsValid)           activeBlockers.push('One or more weights are out of 0–100 range.');
if (!criteriaHaveWeight)  activeBlockers.push('Every criterion needs a weight > 0.');

const canSave =
  !!name.trim() &&
  rowsValid &&
  (!isActive || (weightOk && criteriaHaveWeight));
```
Wire `disabled={!canSave || save.isPending}` on the Save button and surface `activeBlockers` in the tooltip/summary.

## Implementation Steps
1. Add `round2`, `weightOk`, `rowsValid`, `criteriaHaveWeight`, `activeBlockers`, `canSave` memos in `TemplateEditorDialog`.
2. Replace existing single Badge with the sticky summary bar (emerald/destructive) + blocker list.
3. Add per-row red border + helper text on weight inputs using a small `WeightInput` wrapper.
4. Update Save button: `disabled={!canSave}`, wrap in `<Tooltip>` with the blocker message.
5. Add **Save as Draft** secondary button shown only when `isActive && !canSave`; on click → `setIsActive(false); save.mutate()`.
6. Add weight subtotal badges to the System Scores and Criteria TabsTriggers.
7. No backend / RLS / migration changes.

## Tests
New `src/test/annualReview/templateEditorWeightGuard.test.tsx`:
- Active + total 100 → Save enabled.
- Active + total 98 → Save disabled, blocker message visible, "Save as Draft" appears.
- Active + criterion with weight 0 → Save disabled with zero-weight message.
- Draft (isActive=false) + total 80 → Save enabled.
- Row weight set to 150 → row shows error, Save disabled even in Draft.

## Docs
- `src/modules/annual-review/DOCUMENTATION.md` → Template Editor section: document the active-vs-draft save gate.
- `src/modules/annual-review/POLICY.md` → add rule: "Active Annual Review templates MUST have combined weightage = 100% and no zero-weight criteria. Drafts are exempt."

## Audit Steps
1. Open existing Active template, change one weight by ±2 → Save button disables, summary shows new total, tooltip explains.
2. Click **Save as Draft** → template persists with `is_active=false`; reopen → Save re-enables.
3. Restore weights to 100 with `is_active=true` → Save enabled, toast `Template saved`.
4. Verify in DB (`annual_review_templates`) that no row exists with `is_active=true` and sum of weights ≠ 100 after this change.

## Rollback
Pure client change in one file + one test file. Revert the file to remove the guard; no data migration needed.

## Not Applicable
Schema, RLS, edge functions, backups.
