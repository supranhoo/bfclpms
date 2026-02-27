

# Internal (Audit-Only) Observations

## Problem

Currently, all observations on a KPI are visible to every role that can see that KPI. Auditors need the ability to mark an observation as **"Internal"** so it is only visible to Auditors and Admins -- not to the employee, their manager, or other reviewers.

## Solution: Two-Layer Visibility Control

### Layer 1: Database Column + RLS (Enforced Security)

Add an `visibility` column to `kpi_observations` with two values: `'public'` (default, current behavior) and `'internal'` (restricted to Auditor + Admin). This is enforced at the database level via updated RLS policies so that even if the frontend has a bug, internal observations can never leak.

### Layer 2: Admin-Configurable Visibility Roles (Extensibility)

Add a `workflow_settings` row (`observation_internal_visible_roles`) so the Admin can control which roles see internal observations. Default: `["auditor", "admin"]`. This means if the organization later wants Management to also see internal notes, Admin simply adds `"management"` to the setting -- no code change needed.

### Layer 3: Frontend -- Toggle in Add/Edit Dialog + Visual Badge

- Auditors and Admins see a "Mark as Internal (Audit Only)" toggle when creating/editing observations
- Internal observations display a distinctive "Internal" badge with a lock icon
- The `KpiObservationsSection` filters out internal observations for users not in the allowed roles list

---

## Detailed Changes

### 1. Database Migration

Add `visibility` column to `kpi_observations`:

```sql
ALTER TABLE kpi_observations
  ADD COLUMN visibility text NOT NULL DEFAULT 'public';
```

Update RLS SELECT policies: Add a condition so that rows with `visibility = 'internal'` are only returned to users who are auditors or admins. This uses the existing `has_role()` security definer function to avoid recursion.

The key RLS logic for SELECT:

```sql
-- Existing SELECT policies get an additional filter:
-- WHERE (visibility = 'public' OR has_role(auth.uid(), 'auditor') OR has_role(auth.uid(), 'admin'))
```

This ensures internal observations are **never returned** from the database for unauthorized roles, regardless of frontend logic.

### 2. Seed `workflow_settings` Row

Insert one new row for admin configurability:

| Key | Category | Default |
|-----|----------|---------|
| `observation_internal_visible_roles` | `observations` | `["auditor", "admin"]` |

### 3. Update `src/hooks/useKpiObservations.ts`

- Add `visibility` field to `KpiObservation` interface (`'public' | 'internal'`)
- Add `visibility` field to `CreateObservationInput` and `UpdateObservationInput`
- No query changes needed -- RLS handles filtering automatically

### 4. Update `src/components/review/AddObservationDialog.tsx`

- Add a `Switch` toggle: "Internal (Audit Team Only)" -- only visible when `observerRole` is `'auditor'` or `'admin'`
- When toggled on, set `visibility: 'internal'` in the submit payload
- Show a helper text: "This observation will only be visible to Auditors and Admins"

### 5. Update `src/components/review/ObservationCard.tsx`

- When `visibility === 'internal'`, show a distinctive badge with a Lock icon and "Internal" label, styled in a muted purple/indigo color to differentiate from status badges
- This provides a clear visual signal that the note is restricted

### 6. Update `src/components/review/KpiObservationsSection.tsx`

- Add a secondary client-side filter as defense-in-depth: even though RLS blocks internal observations for unauthorized users, the frontend also checks the user's role against the `observation_internal_visible_roles` setting before rendering
- Show an "Internal" filter tab for auditors/admins so they can toggle between "All" and "Internal Only" views

### 7. Update `src/components/admin/WorkflowSettingsTab.tsx`

- Add an "Observations" settings card with the role selector for `observation_internal_visible_roles`
- Uses the same `ALL_APP_ROLES` pattern as the export settings

### 8. Update `src/pages/admin/ObservationsOverview.tsx`

- Add a visibility column to the admin table showing Public/Internal badge
- Add a filter option for visibility type

### 9. Update `DOCUMENTATION.md`

- Document the internal observation feature and its admin controls

---

## Technical Architecture

```text
+------------------+     +------------------+     +-------------------+
|  AddObservation  |     |  kpi_observations|     |  workflow_settings|
|  Dialog          |---->|  visibility col  |<----|  internal_visible |
|  [Internal?] tog |     |  RLS enforced    |     |  _roles config    |
+------------------+     +------------------+     +-------------------+
                               |                         |
                    RLS filters out                Frontend reads
                    internal rows for              allowed roles for
                    non-auditor/admin              UI-level defense
                               |                         |
                          +----v-------------------------v----+
                          |  KpiObservationsSection           |
                          |  - Shows internal badge           |
                          |  - Filter tab for auditors        |
                          +-----------------------------------+
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | Low | New column with default `'public'` -- all existing observations remain visible to everyone |
| Security | None | RLS is the primary enforcement; frontend filtering is defense-in-depth only |
| Regression | Low | Default value `'public'` means zero behavior change for existing observations |
| Workflow | None | Only adds a new optional toggle -- no existing flows are altered |
| Extensibility | Built-in | Admin can add more roles to the visibility list without code changes |

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `kpi_observations` (DB) | Migrate | Add `visibility` column, update RLS SELECT policies |
| `workflow_settings` (DB) | Insert | `observation_internal_visible_roles` config row |
| `src/hooks/useKpiObservations.ts` | Edit | Add `visibility` to interfaces |
| `src/components/review/AddObservationDialog.tsx` | Edit | Add Internal toggle for auditor/admin |
| `src/components/review/ObservationCard.tsx` | Edit | Show Internal badge with lock icon |
| `src/components/review/KpiObservationsSection.tsx` | Edit | Add Internal filter tab for auditors |
| `src/components/admin/WorkflowSettingsTab.tsx` | Edit | Add Observations settings card |
| `src/pages/admin/ObservationsOverview.tsx` | Edit | Add visibility column and filter |
| `DOCUMENTATION.md` | Edit | Document feature |

