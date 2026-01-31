

# Plan: KPI Resubmission Confirmation with Mandatory Reason

## Summary

This plan implements a configurable resubmission workflow for daily/weekly KPI entries:

1. **Per-KPI Toggle**: Admins can enable/disable resubmission confirmation requirement for each KPI
2. **Mandatory Reason Field**: When enabled, employees MUST provide a reason before editing previously submitted data
3. **Audit Trail**: All update reasons are stored in the database for compliance tracking

## Database Changes

### 1. Add Column to `kpis` Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `require_resubmit_reason` | boolean | true | When enabled, shows confirmation dialog and requires mandatory reason for editing submitted entries |

### 2. Add Column to `kpi_templates` Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `require_resubmit_reason` | boolean | true | Template default for the resubmission requirement |

### 3. Add Column to `sub_period_submissions` Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `update_reason` | text | null | Mandatory reason provided when resubmitting/editing a previously submitted entry |

## Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| Database Migration | Create | Add new columns to kpis, kpi_templates, and sub_period_submissions tables |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Modify | Add toggle for resubmission confirmation |
| `src/components/admin/AdminKpiEditDialog.tsx` | Modify | Add toggle for resubmission confirmation |
| `src/components/admin/TemplateFormDialog.tsx` | Modify | Add toggle for resubmission confirmation in templates |
| `src/components/review/DailySubmissionGrid.tsx` | Modify | Add confirmation dialog with mandatory reason field |
| `src/components/review/WeeklySubmissionTable.tsx` | Modify | Add confirmation dialog with mandatory reason field |
| `src/hooks/useSubPeriodSubmissions.ts` | Modify | Include update_reason in submission payload |
| `DOCUMENTATION.md` | Modify | Document new feature |

## Technical Details

### Database Migration SQL

```sql
-- Add resubmission configuration to KPIs
ALTER TABLE kpis 
ADD COLUMN require_resubmit_reason boolean DEFAULT true;

-- Add resubmission configuration to templates  
ALTER TABLE kpi_templates
ADD COLUMN require_resubmit_reason boolean DEFAULT true;

-- Add update reason tracking to sub-period submissions
ALTER TABLE sub_period_submissions
ADD COLUMN update_reason text;
```

### Admin Configuration UI

A new toggle will be added in the KPI creation/edit dialogs under an "Advanced Settings" section:

```
+----------------------------------------------------------+
| Advanced Settings                                         |
+----------------------------------------------------------+
|                                                           |
| [Toggle] Require Reason for Resubmission                  |
|          When enabled, employees must provide a           |
|          mandatory reason when editing previously         |
|          submitted daily/weekly entries                   |
|                                                           |
+----------------------------------------------------------+
```

### Resubmission Workflow Logic

When employee clicks "Edit" on a submitted entry:

**If `require_resubmit_reason` is TRUE:**
1. Show AlertDialog confirmation
2. Display current submitted value and timestamp
3. Show mandatory "Reason for Update" text area
4. "Confirm & Edit" button is disabled until reason is entered
5. On confirm, open edit mode and store reason with the updated submission

**If `require_resubmit_reason` is FALSE:**
1. Open edit mode directly (current behavior)
2. No confirmation dialog shown

### Confirmation Dialog Design

```
+----------------------------------------------------------+
|  Edit Submitted Data?                                     |
+----------------------------------------------------------+
|                                                           |
|  You have already submitted data for 28 January:          |
|                                                           |
|  Current Value: 85%                                       |
|  Submitted On: 28 Jan 2026, 10:30 AM                      |
|                                                           |
|  +----------------------------------------------------+  |
|  | Reason for Update *                                |  |
|  +----------------------------------------------------+  |
|  |                                                    |  |
|  |                                                    |  |
|  +----------------------------------------------------+  |
|                                                           |
|  This reason will be logged for audit purposes.           |
|                                                           |
+----------------------------------------------------------+
|                    [Cancel]  [Confirm & Edit] (disabled)  |
+----------------------------------------------------------+
```

The "Confirm & Edit" button remains disabled until the user enters a reason.

### Hook Updates

Modify `useSubmitSubPeriod` mutation to accept and store `update_reason`:

```typescript
mutationFn: async ({
  kpi_id,
  sub_period_type,
  sub_period_value,
  achieved_value,
  remarks,
  evidence_url,
  review_month,
  review_year,
  update_reason,  // NEW - mandatory for resubmissions
}: {
  // ... existing types
  update_reason?: string | null;
}) => {
  const { data, error } = await supabase
    .from('sub_period_submissions')
    .upsert({
      // ... existing fields
      update_reason: update_reason || null,  // Store the reason
    })
    // ...
}
```

### Component Props Updates

DailySubmissionGrid and WeeklySubmissionTable receive new prop:

```typescript
interface DailySubmissionGridProps {
  // ... existing props
  requireResubmitReason?: boolean;  // From KPI configuration
}
```

## User Experience

### For Employees:

1. **First Submission**: Submit normally without any confirmation
2. **Resubmission (when enabled)**:
   - Click "Edit" on previously submitted row
   - Confirmation dialog appears showing current value
   - Enter mandatory reason for the update
   - Click "Confirm & Edit" (only enabled after entering reason)
   - Edit mode opens with previous values pre-filled
   - Save updates the record with reason logged in database

### For Administrators:

1. When creating/editing a KPI, toggle "Require Reason for Resubmission"
2. Default is ON (enabled) for audit compliance
3. Can disable for KPIs where frequent corrections are expected and formal tracking is not required

## Testing Checklist

After implementation:
- Create KPI with resubmission requirement ON - verify dialog appears on edit
- Create KPI with resubmission requirement OFF - verify no dialog appears
- Verify "Confirm & Edit" button is disabled when reason field is empty
- Submit daily entry, then edit - verify mandatory reason is required
- Submit weekly entry, then edit - verify mandatory reason is required
- Check database `sub_period_submissions.update_reason` column for stored values
- Verify first-time submissions do NOT show confirmation dialog
- Test cancel button in confirmation dialog returns to grid without changes
- Verify the toggle appears correctly in KPI templates

