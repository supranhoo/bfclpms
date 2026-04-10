

## Add "Repair Orphaned Propagations" Button to Admin System Settings

### What's needed
The `repair-orphaned-propagations` edge function already exists and is deployed, but there's no UI to invoke it. We need to add an admin-only button in the System Settings page.

### Plan

**1. Add a "Data Repair" section to `src/pages/admin/SystemSettings.tsx`**
- Add a new settings panel section (similar to existing cards) titled "Data Repair Tools"
- Include a "Repair Orphaned Propagations" button with:
  - Description explaining what it does (fixes org KPIs stuck at `kra_set` with no `review_submission`)
  - A "Run Repair" button that calls `supabase.functions.invoke('repair-orphaned-propagations', { body: { limit: 200 } })`
  - Loading state while running
  - Results display showing: repaired count, null values fixed, skipped, errors
- Icon: `Database` or `RefreshCw` (already imported)

**2. Implementation details**
- The edge function already validates admin role server-side, so it's safe to expose
- Use `useState` for loading/results, call via `supabase.functions.invoke()`
- Show a toast on success/failure
- Display results in a small summary card after execution

**3. Update `DOCUMENTATION.md` and `POLICY.md`**
- Document the admin data repair tool
- Version bump

### Risk Assessment
- **Security**: Edge function already enforces admin-only access server-side
- **Data Impact**: The function performs the same operations as the propagation RPC — safe
- **Regression Risk**: None — additive UI change only

