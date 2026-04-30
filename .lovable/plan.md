
# HR Review Notes & Action Tracker

A lightweight, in-app log so HR can capture KPI-change inputs the moment they come up during reviews, then track each item through to the next KRA-setting cycle. Per-role visibility is admin-configurable — nothing is hardcoded.

## Decisions locked in

1. **Status model:** three states only — `pending` → `in_progress` → `completed`. No separate "WIP" concept. Assignee is optional in any state.
2. **Visibility:** **admin-configurable per role** (Employee, Manager, Skip-Level, HR PMS, Admin, Auditor, Management). No hardcoded role gates in component code.

---

## What gets built

### 1. Database (one new table + one settings key)

**Table: `review_action_notes`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `subject_employee_id` | uuid → profiles | who the note is *about* |
| `kpi_id` | uuid → kpis | nullable — note may be KRA-level, not KPI-level |
| `period_id` | uuid → review_periods | nullable — captured during which review cycle |
| `category` | text | enum-ish: `kpi_change`, `weightage_change`, `target_change`, `new_kpi`, `remove_kpi`, `role_realignment`, `training_need`, `other` |
| `title` | text | short headline (≤120) |
| `details` | text | free-form notes |
| `status` | text | `pending` \| `in_progress` \| `completed`, default `pending` |
| `priority` | text | `low` \| `medium` \| `high`, default `medium` |
| `assignee_id` | uuid → profiles | nullable |
| `target_period_id` | uuid → review_periods | nullable — when the change should land |
| `created_by` | uuid → profiles | NOT NULL |
| `created_at`, `updated_at` | timestamptz | |
| `completed_at` | timestamptz | nullable, set when status flips to completed |
| `completed_by` | uuid → profiles | nullable |

Indexes on `subject_employee_id`, `status`, `period_id`, `assignee_id`.

**Audit trigger:** every insert/update writes a row to the existing `audit_logs` table (action types `review_note_created`, `review_note_updated`, `review_note_status_changed`).

**Settings key (in existing `system_settings`):** `review_action_notes_visibility`

```json
{
  "view":   ["admin","hr_pms","manager","skip_level","management","auditor"],
  "create": ["admin","hr_pms","manager","skip_level"],
  "edit":   ["admin","hr_pms"],
  "delete": ["admin","hr_pms"],
  "view_own_subject": ["employee"]
}
```

- `view` — roles that can see all notes (org-wide, scoped by their normal data access).
- `view_own_subject` — roles that can only see notes where *they* are the `subject_employee_id` (lets the employee see notes about themselves if admin allows).
- `create` / `edit` / `delete` — self-explanatory.
- Admin is always implicitly included (defensive default in code).

### 2. RLS

Use the existing `has_role(uuid, app_role)` SECURITY DEFINER pattern (per project memory — never recurse, never check roles on `profiles`).

Policies:
- **SELECT** — allowed if `public.role_can('view', auth.uid())` returns true, OR (`view_own_subject` includes the user's role AND `subject_employee_id = auth.uid()`), OR row's `created_by = auth.uid()`, OR `assignee_id = auth.uid()`.
- **INSERT** — allowed if `public.role_can('create', auth.uid())` AND `created_by = auth.uid()`.
- **UPDATE** — `public.role_can('edit', auth.uid())` OR `assignee_id = auth.uid()` (assignee can move status forward but not delete).
- **DELETE** — `public.role_can('delete', auth.uid())`.

`role_can(action text, user_id uuid)` is a new SECURITY DEFINER helper that reads the JSON setting and checks the user's effective role. This keeps the visibility config dynamic — admins flip a Switch and RLS picks it up next query, no migration needed.

### 3. UI surfaces

**A. New page: `/hr/review-notes`** (`src/pages/hr/ReviewNotes.tsx`)
- Visible in the sidebar only for roles in the `view` list (read from settings, not hardcoded).
- Filters: status (pills), category, priority, assignee, period, employee search.
- Three-tab default view: **Pending (n)** · **In Progress (n)** · **Completed (n)** — counts always visible.
- Table columns: Employee · Category · Title · Priority · Assignee · Target Period · Updated · Status pill.
- Bulk select → bulk status change, bulk reassign.
- Mobile: collapses to stacked cards (reuses `SafetyResponsiveList` pattern from the design memory).

**B. Inline "Add Note" trigger from review surfaces**
A small `+ Note` icon button injected into:
- `UnifiedScorecard` row actions (per-KPI note)
- Employee profile header (per-employee, KPI-agnostic)
- KRA tile in the KPI mapping matrix (per-KRA)

Opens `AddReviewNoteSheet` with subject/KPI/period pre-filled. The trigger itself is gated by `useReviewNoteAccess().canCreate` — same dynamic config.

**C. "Notes" badge on profile / scorecard**
A small chip showing `2 pending` when a subject has open notes — only rendered if the viewer's role passes the `view` (or `view_own_subject` + self) check.

**D. Admin Settings page section** (`src/pages/admin/ReviewNotesAccess.tsx`, linked from the existing Admin Settings hub)
- One row per role, four switches: View / Create / Edit / Delete, plus the "View only own subject" switch on the Employee row.
- Saves to `system_settings.review_action_notes_visibility`.
- Reuses the visual pattern from `ReviewPeriodRolePermissions.tsx`.

### 4. Hooks & service layer (separation of concerns)

- `src/services/reviewNotes/reviewNotesService.ts` — all DB calls (`list`, `getById`, `create`, `update`, `setStatus`, `remove`).
- `src/hooks/useReviewNotes.ts` — TanStack Query wrappers + invalidation.
- `src/hooks/useReviewNoteAccess.ts` — reads the visibility setting + current effective role and returns `{ canView, canCreate, canEdit, canDelete, canViewSubject(employeeId) }`. **All UI gating goes through this hook — no role string literals in components.**

### 5. Tests (mandatory deliverables)

- `src/test/reviewNotes/access.test.ts` — for each role, asserts `useReviewNoteAccess` returns the right matrix under several saved configs (default, locked-down, employee-self-only, fully open).
- `src/test/reviewNotes/statusFsm.test.ts` — `pending → in_progress → completed` allowed; `completed → pending` allowed (re-open) only for `edit` role; assignee can advance but not re-open.
- `src/test/reviewNotes/rlsShape.test.ts` — mocked Supabase client confirming the right `.eq()` / `.or()` filters are applied per role.
- Mock data added to `src/test/setup.ts` covering: 1 employee with 3 notes (one per status), 1 manager with view-only access, 1 HR PMS with full edit.

---

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| **Data** | One new table, one new `system_settings` key, one new SECURITY DEFINER function. No changes to existing schemas. Audit trail piggybacks existing `audit_logs`. | Migration is additive only; rollback = drop table + delete setting row. |
| **Workflow** | Pure additive log. Does **not** auto-mutate KPIs, weightages, or scorecards. Closing a note is a manual ack — the actual KRA edits still happen in the KRA Library / Org KPI Suite by HR. | Status = `completed` is a flag, not a write to `kpis`. Keeps SSOT clean. |
| **UI/UX** | New sidebar entry (visibility-gated), small `+ Note` glyphs on existing surfaces (subtle, hover-revealed on desktop). | Inline triggers reuse existing icon button pattern; no layout reshuffling. Mobile uses the established `SafetyResponsiveList` pattern. |
| **Regression** | Inline triggers touch `UnifiedScorecard`, profile hero, KPI matrix tile — all read-only additions. | Each integration point is wrapped in `<ReviewNoteTrigger />` so changes to the underlying component are localized. New tests cover access matrix to prevent role-gate regressions. |
| **Security** | Visibility is data-driven. Misconfiguration could expose notes too widely. | Admin UI shows a live "Who can see this?" preview. RLS denies by default — if the settings JSON is missing/corrupt, only `admin` and `hr_pms` retain access (hardcoded fallback in `role_can`). Audit log captures every settings change. |
| **Policy/Docs** | New module → DOCUMENTATION.md and POLICY.md must be updated atomically with the migration. New memory file `mem://features/hr/review-action-notes` describing the access matrix and status FSM. | Done in the same change set. |

---

## Out of scope (explicit)

- Auto-applying notes to actual KPIs (no automated weightage/target mutations from this module — by design).
- Email/notification batching beyond the existing notification engine — initial version uses in-app inbox + the existing daily digest.
- Cross-period analytics on notes (a future "what % of notes get implemented next cycle?" report can be layered on without schema changes).

---

## Files to create / edit

**Migrations**
- `create table review_action_notes` + indexes + RLS + `role_can()` function + audit trigger
- Insert default `review_action_notes_visibility` row

**New code**
- `src/services/reviewNotes/reviewNotesService.ts`
- `src/hooks/useReviewNotes.ts`
- `src/hooks/useReviewNoteAccess.ts`
- `src/pages/hr/ReviewNotes.tsx`
- `src/pages/admin/ReviewNotesAccess.tsx`
- `src/components/reviewNotes/AddReviewNoteSheet.tsx`
- `src/components/reviewNotes/ReviewNoteTrigger.tsx`
- `src/components/reviewNotes/ReviewNotesTable.tsx`
- `src/components/reviewNotes/ReviewNoteStatusPill.tsx`
- Tests as listed above

**Edited (small additions only)**
- `src/components/layout/AppSidebar.tsx` — gated sidebar entry
- `src/components/review/UnifiedScorecard*.tsx` — inject `<ReviewNoteTrigger />` on row
- `src/components/profile/ProfileHero.tsx` — inject trigger + open-notes badge
- `src/pages/admin/KpiMappingMatrix.tsx` — trigger on KRA tile
- `src/App.tsx` — routes for `/hr/review-notes` and the admin settings page
- `DOCUMENTATION.md`, `POLICY.md`, `mem://index.md`

---

Approve and I'll implement in this order: migration → service/hooks → admin settings page → main `/hr/review-notes` page → inline triggers → tests → docs/memory.
