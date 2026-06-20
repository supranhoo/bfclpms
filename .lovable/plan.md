
## Goal
Make the Team Annual Review page look enterprise-grade and replace the always-on text filter with an explicit **click-to-search** experience that can find *any* active employee in the company (gated to Admin / HR PMS), then auto-create their annual review instance and drop the user into Assisted self-review mode.

---

## Risk & Impact Report

- **Data impact:** Adds one RPC `public.create_or_get_annual_review_instance(p_employee_id, p_cycle_id)` (SECURITY DEFINER) that idempotently inserts a row into `annual_review_instances` if one is missing for that employee+cycle, applying the standard assignment-rule resolver. No schema additions; only function + tightened RLS check.
- **Workflow impact:** Reviewer queue (`useReviewerInstances`) is unchanged. The new dialog is an *additional* entry point; users who never touch it see today's behaviour. Auto-created instances respect the existing per-employee workflow resolver.
- **UI/UX impact:** Left rail becomes a slim sticky column with a single "Find employee" CTA; the searchable directory moves into a full-width modal. The selected employee still drives the right pane exactly as today.
- **Regression risk:** Medium-low. Existing `filtered` list logic is preserved for the queue. New code paths are additive.
- **Scalability:** Server-side search via Postgres trigram on `profiles.full_name` + `employee_code` with `is_active = true`, limit 50, debounce 250 ms, paginated "Load more". No full-table client loads.
- **Mitigation:** New RPC + dialog covered by unit tests; route guard for Admin/HR PMS only; existing reviewers retain queue view; feature flag `app_settings.annual_review_directory_search_enabled` for staged rollout.

---

## UI Plan (detailed)

### 1. Page shell (right column unchanged)
```
┌────────────────────────────────────────────────────────────────────────┐
│ Team Annual Review                                  [Calibration ws]   │
│ Annual Review · 2025-26                                                │
├──────────────┬─────────────────────────────────────────────────────────┤
│  Left rail   │  Selected employee header + stage tracker               │
│  (sticky)    │  Assisted-mode banner (if applicable)                   │
│              │  System scores                                          │
│              │  Self-review matrix                                     │
└──────────────┴─────────────────────────────────────────────────────────┘
```

### 2. Left rail (new "Find employee" CTA + compact queue)
- Width: `w-[320px]` desktop, full-width drawer on mobile.
- Top block (sticky, `bg-card`, `border-b`):
  - Heading `My queue` with count badge `{filtered.length}`.
  - Primary button **`Find employee`** (`variant="default"`, `Search` icon, `h-10 w-full`). Opens the directory dialog (see §3).
  - Helper text below button: `Search across all active employees` — visible only for Admin / HR PMS.
- Body: existing queue list, but card design refreshed:
  - Avatar initials circle (32 px), name (`font-medium text-sm`), `employee_code · designation` muted, status chip right-aligned.
  - Row height `h-16`, hover `bg-muted/50`, selected `bg-primary/5 border-l-2 border-primary`.
  - Empty state: Lucide `Users` icon + `No employees in your queue` + secondary `Find employee` button.

### 3. "Find employee" full-width dialog
- Component: `EmployeeDirectoryDialog` (`shadcn Dialog`, `max-w-4xl`, `h-[80vh]`).
- Header: title `Find employee`, subtitle `Search active employees and start an assisted annual review`.
- Sticky search bar:
  - Large `Input` with `Search` icon, placeholder `Name or employee code…`, autofocus.
  - Right side: `Filter` chips — Department, Location, Designation, Has-instance (toggle). Chips populated from existing master-data hooks.
  - Submit on Enter OR debounce 250 ms after typing; explicit `Search` button for click-to-search satisfaction.
- Results area (`overflow-auto`):
  - Loading: 6 skeleton rows.
  - Empty (no query): illustration + `Start typing or click Search`.
  - Empty (with query): `No active employee matches "<q>"`.
  - Result row (`h-14`, `grid-cols-[40px_1fr_auto_auto]`):
    - Avatar initials
    - Name (`font-medium`) + `code · designation · department` muted line
    - Status pill: `In your queue` / `Has instance` / `No instance yet`
    - Action button: `Open` (existing instance) or `Start assisted review` (auto-create) — single primary button per row.
  - Footer: `Showing N of M · Load more` button (server pagination 50 / page).
- Accessibility: `role="dialog"`, focus-trap, `Esc` closes, results announced via `aria-live="polite"`.

### 4. Selection flow
1. User clicks a result.
2. If `instance_id` exists → close dialog, set `selectedId`, scroll right pane into view.
3. If no instance → call new RPC `create_or_get_annual_review_instance`, toast `Creating annual review…`, on success set `selectedId` and open the existing `AssistedSubmissionDialog` automatically (because employee has no login per current eligibility rule). If the employee *does* have a login, just open the standard self-review pane.
4. Errors surface inline in the dialog footer plus a `sonner` toast.

### 5. Visual / token compliance
- All colours via semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary/5`).
- Lucide icons only (`Search`, `Users`, `UserPlus`, `Building2`, `MapPin`).
- Spacing on 4 / 8 px grid, touch targets ≥ `h-10`.
- Skeletons (not spinners) for loading; sticky header inside dialog scroll area.

---

## Technical Plan

### Files to add
- `src/components/annual-review/EmployeeDirectoryDialog.tsx` — dialog UI + server search + selection callback.
- `src/hooks/annualReview/useEmployeeDirectorySearch.ts` — React Query infinite-query hitting `profiles` via a thin `searchActiveEmployees(q, filters, cursor)` service.
- `src/services/annualReview/employeeDirectory.ts` — service-layer wrapper (RLS-aware).
- `src/services/annualReview/createOrGetInstance.ts` — calls the new RPC, returns `{ instanceId, created }`.
- `src/test/annualReview/employeeDirectory.test.ts` — search ranking, empty state, permission gating.
- `src/test/annualReview/createOrGetInstance.test.ts` — idempotency, error mapping.

### Files to modify
- `src/pages/annual-review/TeamAnnualReview.tsx`
  - Replace inline `Input` filter with new left-rail header (queue count + `Find employee` button).
  - Mount `EmployeeDirectoryDialog`; on result selection, run create-or-get, then `setSelectedId` and conditionally open `AssistedSubmissionDialog`.
  - Keep client-side `search` text filter for the queue (operates only on already-loaded queue rows; default empty).
- `src/components/annual-review/AssistedSubmissionDialog.tsx` — accept `autoOpen` prop so the directory flow can trigger it post-creation.
- `mem/features/annual-review/assisted-submission` — append "Directory entry point" section.
- `DOCUMENTATION.md`, `POLICY.md` — add Annual Review directory search policy (who can search, what they can create, audit trail).

### Database migration (single migration file)
- `create or replace function public.search_active_employees_for_review(p_query text, p_cycle_id uuid, p_limit int default 50, p_offset int default 0) returns table(...) security definer` — joins `profiles` (`is_active = true`) with `annual_review_instances` (left), filters by `full_name ILIKE` or `employee_code ILIKE`. Caller authorisation: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr_pms')`.
- `create or replace function public.create_or_get_annual_review_instance(p_employee_id uuid, p_cycle_id uuid) returns uuid security definer` — idempotent insert applying existing assignment-rule resolver; raises `permission_denied` for non-admin/HR.
- Feature flag column: `alter table public.app_settings add column if not exists annual_review_directory_search_enabled boolean not null default false;`
- No new tables; no GRANT changes required beyond the functions' default `EXECUTE` to `authenticated`.

### Permission model
- Search RPC: Admin, HR PMS only. Reporting Managers / Skip Managers continue to see the queue.
- Create-or-get RPC: same gate, plus must respect existing per-employee workflow resolution.
- Every create writes a row in `system_audit_logs` (`event = 'annual_review.instance.auto_created'`, payload includes employee + cycle + initiator).

---

## Step-by-Step Execution & Verification
1. Migration: add feature flag + 2 RPCs → verify with `psql` smoke query (search returns ≤ limit, create_or_get is idempotent).
2. Service layer + hooks → unit tests for happy path, no-results, unauthorised.
3. `EmployeeDirectoryDialog` UI → Storybook-style manual check: empty / loading / results / load-more / error.
4. Wire into `TeamAnnualReview` behind feature flag → verify Admin user sees button, manager-only user does not.
5. Selection flow → for an employee without login, confirm `AssistedSubmissionDialog` auto-opens with selfie capture; for one with login, confirm standard self-review pane loads.
6. Accessibility pass: keyboard nav, focus trap, `aria-live` results, contrast ≥ 4.5:1.
7. Regression check on existing reviewer queue (search box behaviour on queue rows preserved).

---

## Tests & Mock Data
- `employeeDirectory.test.ts` — search ranks exact `employee_code` first, then prefix name, then trigram; empty query short-circuits; unauthorised caller throws.
- `createOrGetInstance.test.ts` — second call returns same `instanceId`; respects cycle; rejects non-admin.
- Updated mock data: 3 sample active employees without instances + 2 without login emails to exercise auto-Assisted flow.

---

## Documentation & Policy Updates
- `DOCUMENTATION.md` → new section *Annual Review · Directory Search & Auto-Instance*.
- `POLICY.md` → who can initiate proxy creation, audit requirements, feature-flag rollout.
- `mem/features/annual-review/assisted-submission` → append directory entry-point + RPC names.

---

## Rollback Strategy
- Toggle `annual_review_directory_search_enabled = false` → UI hides the new button, queue behaviour reverts.
- RPCs are additive; safe to leave deployed.
- No destructive schema changes.

**Verdict on current screenshot:** It is functional but not professional — the search field reads as a placeholder text box with no clear action, list rows are visually noisy (badge competes with name), and there's no affordance for finding an out-of-queue employee. The plan above addresses all three.
