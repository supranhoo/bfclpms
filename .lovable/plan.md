

## Exclude Sent-Back KPIs + Add Sent-Back Tab

### Changes

**1. Modified: `src/hooks/usePendingSelfReviews.ts`**

**a) Exclude sent-back KPIs from Tab 1 (Option A — open send-backs only):**
In `useOverdueKraSetKpis`, after fetching KPIs at `kra_set` (line ~86-88):
- Collect all KPI IDs
- Query `kpi_queries` where `kpi_id IN (...)`, `query_type = 'send_back'`, `status = 'open'`
- Build a `Set<string>` of sent-back IDs
- Skip those IDs in the results loop (`if (sentBackIds.has(kpi.id)) continue;`)

**b) New hook `useSentBackKpis` for Tab 3:**
- Query `kpi_queries` where `query_type = 'send_back'`, `status = 'open'`
- Join to `kpis` (for kpi_name, kra_name, review_period, review_year, employee_id) filtered by month/year and eligible frequencies, `is_org_level = false`
- Join to `profiles` for employee name, code, department
- Also fetch the sender name from `profiles` using `raised_by`
- Export a `SentBackKpi` interface with: kpiId, employeeName, employeeCode, departmentName, kpiName, kraName, reviewPeriod, reviewYear, sentBackBy (name), reason, sentBackDate
- Add `useSendReminder` mutation that calls `send-email-notification` edge function with `pending_review_reminder` event type for selected employee emails

**2. Modified: `src/pages/admin/PendingSelfReviews.tsx`**
- Import new `useSentBackKpis` and `useSendReminder`
- Add third tab "Sent Back KPIs (N)" with `Undo2` icon
- Table columns: Checkbox, Employee, Code, Department, KPI, KRA, Sent Back By, Reason, Date
- Buttons: "Send Reminder Selected" and "Send Reminder All"
- Selection state for sent-back tab (`selectedSentBack`)

**3. Modified: `supabase/functions/send-email-notification/index.ts`**
- Add `pending_review_reminder` event handler with a template reminding the employee about their pending correction

### UI Layout (Tab 3)
```text
Tab 3: Sent Back KPIs (2)
[Send Reminder Selected (1)] [Send Reminder All (2)]
┌──┬──────────┬─────┬───────┬─────┬────────┬────────┬──────┐
│☑ │ Employee │Code │ KPI   │ KRA │ By     │ Reason │ Date │
└──┴──────────┴─────┴───────┴─────┴────────┴────────┴──────┘
```

### No database changes needed

