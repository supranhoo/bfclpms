

# Testing Plan for Review Period Governance System

## What will be tested

The governance system spans 3 layers: pure logic/constants, hooks with RPC calls, and UI components. Testing will focus on the testable units that don't require a live database connection.

## Test Files to Create

### 1. `src/test/reviewPeriodGovernance.test.ts` — Constants & Logic Tests
Tests for all exported constants and pure logic from `useReviewPeriodGovernance.ts`:
- `GOVERNANCE_STAGES` array contains exactly 6 stages in correct order
- `STAGE_LABELS` has entries for all stages
- `PERMISSION_KEYS` contains all 7 permission types
- `PERMISSION_LABELS` has labels for all permission keys
- Stage index calculations (used by Overview and StageController)
- Lock hierarchy logic validation (Employee > Dept > Role > Global — tested via mock scenarios)

### 2. `src/test/reviewPeriodPermissions.test.ts` — Permission Hook Logic Tests
Tests for `useReviewPeriodPermissions.ts`:
- Returns `DEFAULT_OPEN` when no user/period/year provided
- Returns `isLoading: true` while query is in flight
- Correctly maps RPC results to permission flags
- Handles RPC errors gracefully (fail-open behavior)
- Caches results for 30s (staleTime check)

### 3. `src/components/review/GovernanceLockBanner.test.tsx` — Banner Component Tests
- Renders nothing when `isLoading` is true
- Shows destructive "view-only" alert when `view_only` is true
- Shows restriction warning listing disabled permissions
- Shows nothing when all permissions are open
- Shows correct restrictions based on `viewLevel` (management shows "approval", auditor shows "forwarding", manager shows "manager review")

### 4. `src/components/admin/ReviewPeriodOverview.test.tsx` — Overview Component Tests
- Renders period name and year
- Renders current stage badge with correct label
- Calculates progress percentage from stage index
- Shows global lock button with correct state (Locked vs Open)
- Calls `onToggleGlobalLock` when button clicked

### 5. `src/components/admin/ReviewPeriodStageController.test.tsx` — Stage Controller Tests
- Renders all 6 stages in pipeline
- Highlights current stage, marks previous as complete
- Advance button disabled when at last stage (closed)
- Revert button disabled when at first stage (planning)
- Calls `onAdvanceStage` with correct next/previous stage
- Shows closed-stage warning when stage is "closed"

### 6. `src/components/admin/ReviewPeriodRolePermissions.test.tsx` — Role Matrix Tests
- Renders all 7 roles from `ALL_APP_ROLES`
- Renders all 7 permission columns
- Admin role switches are disabled (always full access)
- Save button disabled until a change is made (dirty state)
- Toggling a switch marks the form as dirty

## Technical Approach

- All tests use Vitest + React Testing Library (existing project pattern)
- Component tests mock `supabase` and `useAuth` via `vi.mock()`
- No database calls — all data passed as props or mocked
- Tests follow existing patterns from `workflowEngine.test.ts` and `ErrorBoundary.test.tsx`

## Files Created
- `src/test/reviewPeriodGovernance.test.ts`
- `src/test/reviewPeriodPermissions.test.ts`
- `src/components/review/GovernanceLockBanner.test.tsx`
- `src/components/admin/ReviewPeriodOverview.test.tsx`
- `src/components/admin/ReviewPeriodStageController.test.tsx`
- `src/components/admin/ReviewPeriodRolePermissions.test.tsx`

## Files Modified
None — tests only.

