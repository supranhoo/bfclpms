## Findings — scope of the template-swap orphan-score issue

Ran a system sweep matching every response row's `criteria_scores` keys against its current effective template's criterion IDs.

**16 instances have orphaned score keys (20 response rows total):**

| Status | Instances | Notes |
|---|---|---|
| pending_dept | 8 | Employee has submitted; dept head will see missing/blank scores. |
| pending_bu | 2 | Same, later stage. |
| pending_self | 1 | `test003` (test user). |
| completed | 5 | Already finalised — `final_score` may be frozen. |

**Sample worst offenders** (all orphans on the self response):

- `100958` Prabhat Kumar — 12/24 keys orphaned (`pending_dept`)
- `100118` Sohan Mahto — 10 dept_head orphans (`pending_bu`)
- `100955` Ajij Ansari, `101133` Shrawan Prajapati — 7 each (`pending_dept`)
- `101853` Aftab Khan — 7 on both self + dept_head rows (`pending_bu`)
- Plus 100089, 100289, 101708, 101755, 101815, 200207, 200378, 200474, 200483, 201015 (2–5 orphans each)

The trigger shipped last turn prevents *new* occurrences; these are historical rows from swaps that happened before the trigger existed.

## Proposed repair

1. **Add a bulk repair RPC** `repair_all_orphan_criteria_scores(dry_run bool, include_completed bool)` that, for each affected instance:
   - Auto-detects the previous template by finding the active template whose `criteria[].id` set best covers the orphan keys (highest overlap wins; ties broken by most recent audit-log override entry).
   - Calls the existing `remap_annual_review_criteria_scores` with that prev template.
   - Writes a row per instance to `system_audit_logs` with the detected prev template, coverage %, and per-row before/after counts.

2. **Run it live for the 11 in-flight instances** (`pending_self`, `pending_dept`, `pending_bu`). Orphan keys that can't be matched by `key`/`name` are dropped — same behaviour we just used for 200274.

3. **Completed instances (5): DO NOT touch by default.** They already have a frozen `final_score`. Options:
   - (a) Leave them — orphans are cosmetic since the review is closed.
   - (b) Remap keys but recompute nothing (safe cosmetic fix, `final_score` untouched).
   - (c) Full recompute (risky — changes historical scores).

   I recommend **(b)** if you want the reports/audit views to show scores against the correct criteria; otherwise leave (a).

4. **Post-repair verification query** re-runs the orphan sweep and confirms zero rows.

### Files / DB changes
- New migration: `20260718131000_repair_orphan_criteria_scores.sql` — adds the bulk repair RPC (SECURITY DEFINER, admin/hr_pms only).
- Data operation via `supabase--insert`: `SELECT public.repair_all_orphan_criteria_scores(false, false);` for the 11 in-flight.
- Optional second call with `include_completed=true` **only** if you choose option (b) for the 5 completed instances.

### Not touched
- The auto-carry trigger from last turn stays as-is.
- No schema changes.
- No template edits.

## Question before I build

For the **5 completed instances** (100089 Dhirendra, 101708 Anup Jha, 200378 Abhishek Bedia, 201015 Pinku, 101755 Adarsh), pick one:
- **(a) Leave alone** — safest, `final_score` unchanged, but historical reports still show orphaned keys.
- **(b) Cosmetic remap only** — rewrite keys to current template IDs; `final_score` and any archived reviewer scores stay numerically identical.
- **(c) Skip for now, list them separately** and decide case-by-case.
