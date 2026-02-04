
# Plan: Enable View and Access for N/A KPIs

## ✅ COMPLETED

All changes have been implemented to enable view and access for N/A KPIs.

---

## Summary of Changes

### 1. KpiDetailsTable.tsx - Added View Button for N/A KPIs
- N/A KPIs now display an amber "N/A" badge with a View button (Eye icon)
- Clicking the View button opens the review sheet for that KPI

### 2. MobileKpiCard.tsx - Added View Button for N/A KPIs  
- Same enhancement for mobile view
- N/A badge with View button alongside

### 3. EmployeeScorecard.tsx - Integrated NaConfirmationCard
- Added `naConfirmed` and `naRemarks` state
- Integrated `NaConfirmationCard` component for N/A KPI reviews
- Updated `handleApprove` to handle N/A confirmation with audit logging
- Updated button disable logic to require N/A confirmation
- Button text changes to "Confirm N/A" for N/A KPIs

### 4. AuditScorecard.tsx - Integrated NaConfirmationCard
- Added `naConfirmed` and `naRemarks` state
- Integrated `NaConfirmationCard` component
- Updated `handleSubmitReview` to handle N/A confirmation
- Updated button disable logic and text for N/A KPIs
- Button text changes to "Confirm N/A & Forward"

### 5. ManagementScorecard.tsx - Integrated NaConfirmationCard
- Added `naConfirmed` and `naRemarks` state
- Integrated `NaConfirmationCard` component
- Updated `handleSubmitReview` to handle N/A confirmation
- Updated button disable logic and text for N/A KPIs
- Button text changes to "Confirm N/A & Approve"

### 6. KpiTimeline.tsx - Already had N/A action configs
- `MANAGER_NA_CONFIRMED`, `AUDITOR_NA_CONFIRMED`, `MANAGEMENT_NA_CONFIRMED` actions were already configured

---

## User Experience After Implementation

1. **Team Review (Manager)**: Sees N/A KPIs with amber "N/A" badge + Eye icon. Clicking opens sheet showing:
   - Employee's reason for marking N/A (via NaConfirmationCard)
   - Confirmation checkbox
   - Manager remarks field
   - "Confirm N/A" button (enabled when checkbox checked)

2. **Audit Panel (Auditor)**: Same pattern with "Confirm N/A & Forward" button

3. **Management Review**: Same pattern with "Confirm N/A & Approve" button

4. **Timeline**: All N/A confirmations appear in KPI Timeline with remarks

---

## Validation

- ✅ N/A KPIs are now visible and accessible at all workflow levels
- ✅ Reviewers must explicitly confirm N/A status before advancing
- ✅ Full audit trail of N/A confirmations maintained in kpi_audit_logs
- ✅ Desktop and mobile views both support N/A access
