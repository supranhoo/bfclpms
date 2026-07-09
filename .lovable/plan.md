## Goal
Backfill every Annual Review template (40 total) so that every criterion has the exact "Configure" preset shown in the screenshot.

## Preset to apply (from screenshot)
- Reviewer Stages: **Self Review, Dept Head, BU Head, HR Final** (internal keys: `self`, `dept_head`, `bu_head`, `hr`)
- Enable Remarks: **OFF**
- Enable Evidence Upload: **OFF**
- Evidence Required: **OFF**

## Scope
- Table: `public.annual_review_templates` (40 rows).
- Field: `sections -> 'criteria'` (JSONB array; e.g. DRI - M - Process has 19 criteria, DRI - M - QC has 21, some have 0).
- Every criterion in every template is rewritten — no filtering by active/draft.
- Only these 4 keys are overwritten on each criterion: `reviewer_stages`, `enable_remarks`, `enable_evidence`, `evidence_required`. All other keys (id, name, weight, description, translations, scoring bands, options, etc.) are preserved untouched.
- `sections.system_scores`, `sections.self_review_fields`, `sections.eligibility_criteria`, `stage_weights`, `settings`, etc. are **not** touched.
- No schema change. No code change. No default-for-future change (per your answer: one-time backfill only).

## Execution (data-only UPDATE)
A single SQL UPDATE that walks the `criteria` JSONB array and rewrites the 4 keys per element:

```sql
UPDATE public.annual_review_templates t
SET sections = jsonb_set(
      sections,
      '{criteria}',
      COALESCE(
        (SELECT jsonb_agg(
                  c
                  || jsonb_build_object(
                       'reviewer_stages', jsonb_build_array('self','dept_head','bu_head','hr'),
                       'enable_remarks',   false,
                       'enable_evidence',  false,
                       'evidence_required',false
                     )
                )
         FROM jsonb_array_elements(sections->'criteria') AS c),
        '[]'::jsonb
      )
    ),
    updated_at = now()
WHERE jsonb_typeof(sections->'criteria') = 'array';
```

Run via the insert tool (data change, not schema).

## Verification
After the update, run:
```sql
SELECT id, name,
       bool_and(c->'reviewer_stages' = '["self","dept_head","bu_head","hr"]'::jsonb) AS stages_ok,
       bool_and((c->>'enable_remarks')::boolean = false)   AS remarks_ok,
       bool_and((c->>'enable_evidence')::boolean = false)  AS evidence_ok,
       bool_and((c->>'evidence_required')::boolean = false) AS required_ok
FROM annual_review_templates,
     LATERAL jsonb_array_elements(sections->'criteria') AS c
GROUP BY id, name;
```
Expect all 4 booleans = `true` for every template row returned. Spot-check "DRI - M - Process" (19 criteria) and "DRI - M - QC" (21 criteria) in the UI Configure popover.

## Risk & Impact
- **Data impact:** Overwrites `reviewer_stages`, `enable_remarks`, `enable_evidence`, `evidence_required` on ~450+ criteria across 40 templates. Existing custom stage selections on any criterion are lost. All other criterion fields preserved.
- **Workflow impact:** Any in-flight review instance already materialized from a template is unaffected (instances snapshot their own copy). Only future instances created from these templates will inherit the new preset.
- **Regression risk:** Low — 4 keys, additive JSONB merge, no schema change. Templates with `criteria: []` or missing key are skipped by the `WHERE`.
- **Rollback:** Automatic Cloud backup (daily snapshot) plus we can capture a pre-image dump of `sections` before running if you want a belt-and-braces safety net.

## Post-implementation
- No `DOCUMENTATION.md` / `POLICY.md` change required — this is a one-time data alignment, not a policy or behavior change.
- No new tests — data-only migration, no code path modified.

Confirm to run, and I'll execute the UPDATE. If you'd like a pre-image backup snapshot of `sections` into a side table first, say so and I'll add that as step 0.