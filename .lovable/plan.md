

# Feature: Admin Delete Assigned KRA

## Problem
There is currently no way for an admin to remove/delete an assigned KRA from the All KPIs page. No delete button exists in the UI, and no DELETE RLS policy exists on the `kpis` table.

## Solution

Add a delete button to each KPI row in the expanded employee view, with a confirmation dialog to prevent accidental deletions.

### Database Change

Add a DELETE RLS policy on the `kpis` table so admins can remove records:

```sql
CREATE POLICY "Admins can delete KPIs"
  ON public.kpis
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
```

### Code Changes

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Add a new `useAdminDeleteKpi` mutation hook that calls `supabase.from('kpis').delete().eq('id', kpiId)` and invalidates the `['all-kpis']` query cache |
| `src/pages/admin/AllKpis.tsx` | Add a Trash2 icon button next to the Edit button on each expanded KPI row; wire it to open a confirmation AlertDialog; on confirm, call the delete mutation |
| `DOCUMENTATION.md` | Document the delete KRA capability |

### User Experience

1. Admin expands an employee row on the All KPIs page
2. Each KPI row now shows a red trash icon button alongside the existing Edit button
3. Clicking the trash icon opens a confirmation dialog: "Are you sure you want to delete this KRA? This action cannot be undone."
4. The dialog shows the KRA name and KPI name for clarity
5. On confirm, the KRA is permanently deleted and a success toast appears
6. The table refreshes automatically

### Safety Guardrails

- Confirmation dialog prevents accidental deletions
- Only admins can delete (enforced by RLS policy)
- The dialog displays the specific KRA/KPI name so the admin can verify before confirming
- Related data (review submissions, daily submissions, queries) should be considered -- if foreign keys with CASCADE exist, dependent data will also be removed. If not, the delete will fail gracefully with an error toast.
