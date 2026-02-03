
# Plan: Add Send Back Button to Management Review Sheet

## The Problem

The Management Assessment review sheet (shown when reviewing a KPI) currently only has three buttons:
- **Cancel** - Close without saving
- **Save Draft** - Save progress without approving
- **Approve** - Finalize and approve the KPI

The **Send Back** option exists in the system but is only accessible via a separate action (table row), not from within the review dialog. This means Management must close the review sheet, find the Send Back action in the table, and then proceed - an inefficient workflow.

## The Solution

Add a **Send Back** button directly in the Management Assessment review sheet footer, allowing reviewers to send back a KPI without closing the dialog.

---

## Visual Change

**Current Footer:**
```
[ Cancel ]  [ Save Draft ]  [ ✓ Approve ]
```

**New Footer:**
```
[ ↩ Send Back ]  [ Cancel ]  [ Save Draft ]  [ ✓ Approve ]
```

The Send Back button will open the existing Send Back dialog, allowing the reviewer to select a target (Auditor, Manager, or Employee) and provide a reason.

---

## Technical Implementation

### File: `src/components/review/ManagementScorecard.tsx`

#### Change 1: Add Send Back handler function

Add a function to trigger the Send Back dialog from within the review sheet:

```typescript
const handleSendBackFromSheet = () => {
  // Close the review sheet first
  setReviewSheetOpen(false);
  // Then open the Send Back dialog
  if (selectedKpi) {
    setSendBackReason('');
    setSendBackTarget('auditor');
    setSendBackDialogOpen(true);
  }
};
```

#### Change 2: Update SheetFooter

Modify the footer section (lines 660-679) to include the Send Back button:

```tsx
<SheetFooter className="pt-4 border-t gap-2">
  {/* Send Back button - leftmost */}
  <Button
    variant="outline"
    onClick={handleSendBackFromSheet}
    className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
  >
    <Undo2 className="h-4 w-4 mr-2" />
    Send Back
  </Button>
  
  <div className="flex-1" /> {/* Spacer to push other buttons right */}
  
  <Button variant="outline" onClick={() => setReviewSheetOpen(false)}>
    Cancel
  </Button>
  <Button
    variant="secondary"
    onClick={() => handleSubmitReview(false)}
    disabled={managementScore === null || submitManagementReview.isPending}
  >
    Save Draft
  </Button>
  <Button
    onClick={() => handleSubmitReview(true)}
    disabled={managementScore === null || submitManagementReview.isPending}
    className="bg-emerald-600 hover:bg-emerald-700"
  >
    <Check className="h-4 w-4 mr-2" />
    Approve
  </Button>
</SheetFooter>
```

---

## Consistency Check

Apply the same pattern to **AuditScorecard** component so Auditors also have Send Back option in their review sheet.

### File: `src/components/review/AuditScorecard.tsx`

Same changes: add handler function and update SheetFooter with Send Back button (targeting Manager or Employee).

---

## Unit Test Requirements

### Test File: `src/components/review/ManagementScorecard.test.tsx`

Tests to write:
1. **Send Back button renders** - Verify button appears in SheetFooter
2. **Click triggers dialog** - Verify clicking Send Back opens the SendBackDialog
3. **Dialog has correct targets** - Verify Auditor, Manager, and Employee options are present
4. **Reason required** - Verify Send Back button is disabled without reason text
5. **Successful send back** - Mock supabase and verify correct mutations are called

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/ManagementScorecard.tsx` | Add Send Back button to SheetFooter |
| `src/components/review/AuditScorecard.tsx` | Add Send Back button to SheetFooter |
| `DOCUMENTATION.md` | Update to document Send Back from review sheet |
| `src/components/review/ManagementScorecard.test.tsx` | Create unit tests (new file) |
| `src/components/review/AuditScorecard.test.tsx` | Create unit tests (new file) |

---

## Testing Checklist

1. **Management Review Sheet**
   - [ ] Send Back button visible in footer
   - [ ] Clicking Send Back opens the dialog
   - [ ] Can select Auditor, Manager, or Employee
   - [ ] Reason field is required
   - [ ] Successful send back updates KPI status
   - [ ] Audit log entry created

2. **Audit Review Sheet**
   - [ ] Send Back button visible in footer
   - [ ] Can select Manager or Employee
   - [ ] Reason field is required
   - [ ] Successful send back works correctly
