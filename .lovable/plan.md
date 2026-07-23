## Feasibility check — Add "Management" as the terminal stage after BU Head

### Current state (verified)

| Layer | Value |
|---|---|
| `annual_reviewer_role` enum | `self, manager, skip_manager, dept_head, bu_head, hr` — **no `management`** |
| `annual_review_status` enum | `…pending_bu, pending_hr, completed…` — **no `pending_management`** |
| `annual_review_instances` FK columns | `manager_id, skip_id, dept_head_id, bu_head_id, hr_id` — **no `management_id`** |
| Actual `enabled_stages` in cycle | `[self]`, `[self, bu_head]`, `[self, dept_head, bu_head]` — `hr` stage exists but is unused (0 instances) |
| Users with `management` app role | **1 person: Gaurav Budhia (100001)** |
| Distinct BU Heads | 24 |
| BU Heads whose reporting manager IS `management` | 20 of 24 (all → Gaurav Budhia) |
| BU Heads whose reporting manager is NOT `management` | 4 exceptions: **Dhiraj→Jaspal**, **Shyam Sundar Hati→Sajid Raza**, **Umesh Kumar Singh→Piyush Bansal**, **Gaurav Budhia (no manager — he IS management)** |

Verdict: **feasible and non-breaking** — the request slots cleanly on top of the existing stage machinery (same pattern as `bu_head` and `hr`). But it needs coordinated changes across enum, schema, workflow chain, RPCs, RLS, badges, and stepper, plus a policy call on the 4 exceptions.

### Two policy decisions I need you to confirm

1. **Where does "Management" sit?**
   - **Option A (recommended):** `management` becomes the new terminal stage after `bu_head`. `hr` remains defined but unused as today. Chain: `self → manager → skip_manager → dept_head → bu_head → management`.
   - Option B: replace `hr` with `management` in the terminal slot (rename).

2. **Who fills the `management_id` slot for a review?**
   - **Option A (recommended, dynamic):** derive from `profiles.reporting_manager_id` of the BU Head assigned to the instance, **provided that person has role `management`**. If the BU Head's reporting manager is not `management` (the 3 exceptions above), fall back to the single global `management` user (Gaurav Budhia). For Gaurav's own review, auto-skip the management stage (same-person collapse — ADR-137 already handles this).
   - Option B (static): always route to Gaurav Budhia.
   - Option C (config table): new `management_reviewer_config` table with per-BU or per-BU-Head overrides; UI in admin. More effort, safest long-term.

I will assume **A + A** unless you say otherwise.

---

## Implementation plan (assuming A + A)

### 1. Schema migration (additive, backward-compatible)

- `ALTER TYPE annual_reviewer_role ADD VALUE 'management'`
- `ALTER TYPE annual_review_status ADD VALUE 'pending_management'`
- `ALTER TABLE annual_review_instances ADD COLUMN management_id UUID REFERENCES profiles(id)`
- New helper `resolve_management_reviewer(bu_head_id UUID) RETURNS UUID` — dynamic per policy above, single global fallback, self-loop guard.
- Backfill `management_id` for existing instances that have `bu_head_id`, and append `'management'` to `enabled_stages` **except** where BU Head = management person themselves (Gaurav's 5 instances) — mirrors ADR-137 collapse.
- Update `enforce_bu_head_terminal_stage()` trigger: BU Head-terminal now means `bu_head + management` (unless collapsed).
- Update `advance_annual_review_status` / `rollback_annual_review_completed` / `notify_on_kpi_status_change`-style RPCs to know about `pending_management` and the `management` role.
- RLS: extend `annual_review_responses` and `can_access_annual_review_instance_for_assistance` to allow the resolved `management_id` and users with role `management`.

### 2. Frontend SSOT updates (`src/lib/annualReview/`)

- `constants.ts`: add `management: 'Management'`, `pending_management: 'Management Review Pending'`, colour token, `STAGE_ORDER` append.
- `stageChain.ts`: append `'management'` to `STAGE_HIERARCHY`, extend `nextStatus`/`stageToStatus` maps, update default chain.
- `stageForReviewer.ts`: add `case 'pending_management': return inst.management_id === uid ? 'management' : null`.
- `displayStageForResponse.ts`: label remap for collapsed cases (mirror ADR-128).
- Add `management_id` to the instance type (regenerated automatically once migration lands).

### 3. UI surfaces

- Header badge — automatic via `constants.ts` map.
- Stepper — auto-renders new stage; verify auto-skip note fires when BU Head = Management person.
- Admin queue filter (`AnnualReviewAdmin.tsx`) — add `pending_management` to `statusFilter` enum, counts hook, `<SelectItem>` and short-label maps.
- Team queue (`TeamAnnualReview.tsx`) — add `{ value: 'pending_management', label: 'Management' }`.
- Reviewer inbox — Gaurav (and future management users) will see instances in the new `management` bucket by the same helper `stageForReviewer`.

### 4. Regression protection

- Unit tests: extend `stageChain.test.ts`, `stageForReviewer.test.ts`, add `resolveManagementReviewer.test.ts` (dynamic + fallback + self-loop).
- SQL smoke: assert `enabled_stages` cardinality after backfill, and that Gaurav's 5 own-instances did **not** gain a `management` stage.
- Reuse ADR-137 duplicate-reviewer collapse tests as the pattern.

### 5. Docs & policy

- `POLICY.md §AR-MANAGEMENT-TERMINAL (ADR-138)` — chain, resolver, fallback rules, collapse behaviour.
- `DOCUMENTATION.md` — version-history entry, updated stage diagram.

### 6. Risk & Impact

| Area | Risk | Mitigation |
|---|---|---|
| Data | 2,570 instances get one extra pending stage; final-score persistence timing shifts one step later | Backfill in single migration with dry-run counts logged to `annual_review_head_remap_audit_2026_07` sibling table |
| Workflow | Instances currently `completed` at BU stage would technically be "incomplete" under new chain | **Do not** re-open completed instances. Apply new chain only to non-completed instances; keep completed rows as-is |
| UI/UX | New badge colour / stepper node | Reuse existing token vocabulary |
| Regression | RPC surface area (advance/rollback/notify) | Additive branches only; existing enum values untouched |
| Roles | Only one `management` user today | Encoded as fallback; adding more management users later is a role assignment, no code change |

### 7. Rollback strategy

- Every added enum value is additive (Postgres does not allow removing enum values easily, but the app can ignore them).
- Migration writes a reversal snapshot: `management_id` and stage-append pairs into an audit table so we can null the column + strip stage on abort.

---

## What I need from you before building

- Confirm **Option A** for the position (append after `bu_head`, keep `hr` dormant).
- Confirm **Option A** for the resolver (dynamic from BU Head's reporting manager, fallback to single global management user, self-loop skip).
- Confirm whether the **4 exceptions** (Dhiraj/Shyam/Umesh Kumar Singh — plus Gaurav's own review) should fall back to Gaurav, or be listed for you to reassign in the admin console before the migration runs.

Once you confirm, I'll ship the migration + code + tests in one build turn.
