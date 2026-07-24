## Diagnosis

**Jaspal (101125)** — status `pending_management`, `enabled_stages = ["self","management"]`, `management_id` currently points to **Dummy (001)** instead of the real Management user **Gaurav Budhia (100001)**. Two active Management users exist; the trigger resolver seeded the wrong one.

**Gap in tooling.** The row `...` menu on Annual Review Admin → Progress already offers "Change workflow", but:
- `ChangeWorkflowDialog` only toggles `self / manager / skip_manager / dept_head / bu_head / hr` — **Management is missing**.
- There is no per-instance UI to **change the reviewer identity** for a slot. `reassign_annual_review_reviewer` RPC exists but only accepts `manager / skip_manager / dept_head / bu_head / hr` — **not `management`**.
- Result: an admin can't fix Jaspal from the UI today.

## Plan

### 1. Immediate data fix — Jaspal
After the RPC accepts `'management'`, call `reassign_annual_review_reviewer(instance='01f168dd…', role='management', new_reviewer=Gaurav b796a417…, reason='ADR-157 — correct Management reviewer for Jaspal')`. This also inserts the override row so the resolver won't revert it on the next trigger fire.

### 2. Backend — extend for Management role (ADR-157)
Single migration:
- **`reassign_annual_review_reviewer`**: allow `p_role='management'`; when reassigning, validate the target user has `management` role (via `has_role`); update `annual_review_instances.management_id`; write to `annual_review_assignment_overrides`.
- **`set_annual_review_enabled_stages`**: accept `'management'` in the array; keep normalisation via `enabledChain`.
- **`enforce_management_terminal_stage`** trigger: before resolving from BU chain, honour an existing `annual_review_assignment_overrides` row with `role='management'` — an explicit admin override wins over the resolver so reassignments stick.
- **Verification block** in migration: reassign Jaspal to Gaurav Budhia (data change guarded to the single instance id).

### 3. UI — replace "Change workflow" with "Edit workflow & reviewers"
Rename the menu item and refactor `ChangeWorkflowDialog` into a single sectioned dialog. No new menu items — same entry point.

```text
┌ Edit workflow & reviewers — Jaspal (101125) ──────────────┐
│ Stages                                                    │
│  [x] Self Review                                          │
│  [ ] Manager Review                                       │
│  [ ] Skip Manager Review                                  │
│  [ ] Department Head Review                               │
│  [ ] BU Head Review                                       │
│  [ ] HR Finalization                                      │
│  [x] Management Review                                    │
│                                                           │
│ Reviewers (only for enabled stages)                       │
│  Management  [ Gaurav Budhia (100001)      ▼ search ]     │
│                                                           │
│ Preview: Self → Management (Gaurav Budhia)                │
│                                                           │
│ Reason (min 3 chars)   [ ______________________________ ] │
│                                     [ Cancel ] [ Save ]   │
└───────────────────────────────────────────────────────────┘
```

Details:
- **Stages section**: existing checkbox list + a new **Management** row. Same "at least one stage" rule.
- **Reviewers section**: for each enabled non-Self stage, render a searchable **Combobox** (shadcn Command inside Popover) prefilled with the current reviewer. Search by name **or** employee code, capped at 200 rows.
- **Candidate list per role** is scoped via a small hook `useReviewerCandidates(role)`:
    - `manager / skip_manager / dept_head / bu_head` → active profiles with `manager` role (existing convention).
    - `hr` → active profiles with `hr_pms` role.
    - `management` → active profiles with `management` role.
- **Save** dispatches:
    1. `set_annual_review_enabled_stages` if stages differ.
    2. For every reviewer slot changed, `reassign_annual_review_reviewer` (sequential, per-slot toast on failure).
  All under the same reason string; single success toast; refetch on completion.
- **Guards** (unchanged): only visible when `canChange && !isPastSelf` (admin/hr_pms, no locked responses yet). If a Management slot needs correcting after Management is already active (like Jaspal), we extend the guard to also allow reviewer-only reassignment while `overall_status = 'pending_management'` and no Management response is locked — reviewer swap is safer than a full workflow change and the RPC already writes the override.

### 4. Files touched
| Purpose | File |
|---|---|
| Dialog rewrite | `src/components/annual-review/ChangeWorkflowDialog.tsx` (rename export `EditWorkflowAndReviewersDialog`; keep re-export for compat) |
| New hook | `src/hooks/annualReview/useReviewerCandidates.ts` |
| Service | `src/services/annualReview/annualReviewService.ts` — extend `setEnabledStages` to allow `'management'` and add `reassignReviewer({instanceId, role, newReviewerId, reason})` |
| Types | `src/types/annualReview.ts` — add `'management'` to `AnnualReviewerRole` if missing; update `enabledChain` seniority to place `management` at the end |
| Admin menu label | `src/pages/annual-review/AnnualReviewAdmin.tsx` line 1091 → "Edit workflow & reviewers" |
| Migration | `supabase/migrations/*` — RPC + trigger updates + Jaspal data fix |
| Tests | `src/test/editWorkflowAndReviewersDialog.test.tsx`, `src/test/annualReviewReassignReviewer.test.ts` |
| Docs | `DOCUMENTATION.md`, `POLICY.md` (§AR-MANAGEMENT-REASSIGN), ADR-157 |

### 5. Risk & mitigation
- **Regression** on existing "Change workflow" callers → same dialog import path, additive props, snapshot test.
- **Wrong-role reviewer picked** → RPC-side role validation blocks it; UI Combobox is scoped so it can't happen accidentally.
- **Trigger overwrites reassignment** → resolver checks for override row first (fixes Jaspal recurrence).
- **Cycle lock** → RPC continues to respect `block_when_annual_cycle_closed`.

### 6. Out of scope
Bulk reviewer reassignment (single-instance is enough for this ticket); rework of Reviewers grid; template changes.