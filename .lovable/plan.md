## Scope (narrowed)

Only the two templates:
- **CPP - W - E** (`60854223-…`)
- **CPP - W - Instrument** (`f31f3266-…`)

Template criteria were last updated at **2026-07-16 11:05:05 UTC** (the standardisation migration).

## Candidates found (12 in-flight, 10 eligible)

Filter used: instance currently mapped to one of the two templates (via `template_override_id` or `template_id`), `overall_status` past self, only a `self` response exists, and that `self.submitted_at < template.updated_at` (i.e. submitted against the OLD template).

| # | Emp code | Name | Template | Self submitted | Action |
|---|---|---|---|---|---|
| 1 | 100592 | Pawan Kumar Singh | CPP - W - E | 10:10 | Reset |
| 2 | 100710 | Bijay Kumar Patel | CPP - W - E | 10:39 | Reset |
| 3 | 100711 | Vivek Kumar Patel | CPP - W - E | 08:09 | Reset |
| 4 | 100737 | Niraj Kumar Yadav | CPP - W - E | 07:15 | Reset |
| 5 | 100760 | Vikash Kumar | CPP - W - E | 09:27 | Reset |
| 6 | 100771 | Sandeep Kumar | CPP - W - E | 07:33 | Reset |
| 7 | 100844 | Avinash Kumar | CPP - W - E | 07:00 | Reset |
| 8 | 101015 | Prabhat Kumar | CPP - W - E | 09:14 | Reset |
| 9 | 101291 | Md Mujanabin Ansari | CPP - W - E | 09:55 | Reset |
| 10 | 100774 | Surjya Narayan Jena | CPP - W - Instrument | 10:12 | Reset |
| — | 100284 | Pritam Kumar Singh | CPP - W - E | 11:07 (after) | **Skip** — submitted under new template |
| — | 101088 | Anand Kumar | CPP - W - E | 11:06 (after) | **Skip** — submitted under new template |

Instances where any non-self reviewer has already scored → **not touched** (none in this set anyway).

## Risk & Impact

- **Data**: Self response is preserved; only `is_locked` flipped to `false`. `overall_status` regresses to `pending_self`. No score loss.
- **Workflow**: 10 dept-head queue items disappear; 10 self-review items reappear for the employees.
- **Audit**: One `annual_review_audit_logs` row per instance — action `annual_review.reset_to_self_for_template_change`, metadata contains previous status, template id, template `updated_at`, and self `submitted_at`.
- **Rollback**: Reverse from the audit log rows (set status back, re-lock self).

## Plan

1. **Migration** (single transaction, WHERE clause hard-scoped to the 10 candidate instance IDs derived by the query above):
   - `UPDATE annual_review_responses SET is_locked = false, updated_at = now()` for the Self rows of the 10 instances.
   - `UPDATE annual_review_instances SET overall_status = 'pending_self', updated_at = now()` for the 10 instances.
   - Insert one `annual_review_audit_logs` row per instance.
2. **Verify**: re-run the candidate query — expected count = 0. Spot-check 3 employees (100710, 100844, 100774) show `pending_self` + unlocked self + original criteria_scores intact.
3. No code changes; no test changes required.

Nothing else in the DB or app is touched — CPP - M, CPP - W - E&I, CPP - W - Mech, CPP - W - Operation*, CPP - W - QC DMP, and every non-CPP template are all left alone.
