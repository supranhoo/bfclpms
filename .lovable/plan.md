## RCA — Employee 102021, HOD stage shows only a subset of questions

### What the HOD sees
`EmployeeAnnualReview → TeamReviewDetailContent` renders criteria via `criteriaForStage(template, role)` (`src/lib/annualReview/templateVisibility.ts`), which keeps only criteria whose `reviewer_stages` array contains the current stage. For Prabhat Kumar Singh, `stageForReviewer(...)` resolves to `dept_head` (he is the instance's `dept_head_id`).

### Instance snapshot
- Employee 102021 (Dilip Kumar), instance `129a9fd6…`, `overall_status = pending_dept`
- `enabled_stages = [self, dept_head, bu_head]`
- Effective template = `template_override_id = 408ae1b3…` → **"DRI/Admin - W - Pollution"** (19 criteria)

### The mismatch (root cause)
On template `408ae1b3…`, only 3 of the 19 criteria include `dept_head` in `reviewer_stages`:

| # | Criterion | reviewer_stages |
|---|---|---|
| 1 | Attendance & Punctuality | self, **dept_head**, bu_head, hr |
| 2 | PPE, Safety Rules & Shop-Floor Discipline | self, **dept_head**, bu_head, hr |
| 3 | Quality & Efficiency of Work | self, **dept_head**, bu_head, hr |
| 4–19 | Pollution/Ops criteria | self, **manager**, **skip_manager**, bu_head, hr |

Criteria 4–19 target `manager` / `skip_manager` but the instance workflow uses `dept_head` (Head-Master workflow). The template was authored/imported with the wrong stage keys for its second block, so `criteriaForStage(template, 'dept_head')` legitimately returns only rows 1–3. (The extra "question" the user sees comes from the system-score card above — hence the "3 to 6" perception.)

Blast radius check: **39 instances** consume this template, **all via override**, all with the same `enabled_stages = [self, dept_head, bu_head]`. Every one of them is affected identically. No other template is impacted.

### Fix (surgical, one template only)

Single data migration that rewrites `reviewer_stages` on the 16 offending criteria of template `408ae1b3-95ac-4fc9-a404-54c5178bc510` so they align to the workflow the template is actually mapped to:

- Old: `["self","manager","skip_manager","bu_head","hr"]`
- New: `["self","dept_head","bu_head","hr"]`

Rows 1–3 are already correct and left untouched. `hr` is preserved so HR read/finalize keeps rendering the row (harmless — HR stage is not enabled here, but consistent with rows 1–3). No schema change, no code change, no touch to other templates or other instances.

```sql
-- Migration: fix reviewer_stages on template 408ae1b3… (DRI/Admin - W - Pollution)
-- Rows 4..19: replace manager/skip_manager with dept_head to match the
-- enabled_stages [self, dept_head, bu_head] used by all 39 instances.
UPDATE public.annual_review_templates
SET sections = jsonb_set(
  sections,
  '{criteria}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN ord BETWEEN 4 AND 19
          THEN jsonb_set(c, '{reviewer_stages}',
                         '["self","dept_head","bu_head","hr"]'::jsonb)
        ELSE c
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(sections->'criteria') WITH ORDINALITY arr(c, ord)
  ),
  false
),
updated_at = now()
WHERE id = '408ae1b3-95ac-4fc9-a404-54c5178bc510';
```

### Verification steps
1. Re-query the template: all 19 criteria have `dept_head` in `reviewer_stages`.
2. Reload the appraisal form as Prabhat Kumar Singh (HOD) for emp 102021 → all 19 questions visible under the HOD stage.
3. Open one instance where the self-stage was already submitted → self-view still shows all 19 rows (unchanged, `self` was always present).
4. Confirm no other template rows were modified: `SELECT updated_at FROM annual_review_templates WHERE id <> '408ae1b3…' AND updated_at > <migration_ts>` returns empty.

### Guard against regression (documentation-only, no code)
Add a short note in `DOCUMENTATION.md` / template authoring section: **every criterion's `reviewer_stages` must intersect the instance's `enabled_stages`, otherwise the row is invisible to that stage**. A schema-level lint (future work, out of scope for this fix) can flag templates where any `reviewer_stages` list does not overlap the workflow's enabled_stages set.

### Rollback
Single-statement revert: restore prior `reviewer_stages` on rows 4–19 to `["self","manager","skip_manager","bu_head","hr"]`. No dependent code paths to unwind.

### Not changed
- No source code files
- No other templates
- No employee, department, or workflow definitions
- No RLS / policies / triggers
