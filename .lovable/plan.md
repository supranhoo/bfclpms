

# Plan: Add Review Period (Month/Year) to All KPI Email Templates

## Problem
Email notifications for KPI events (sent back, approved, queries, etc.) don't include the review period month and year. The data (`review_period`, `review_year`) is already passed from the database trigger to the edge function — it's just missing from the template text.

## Changes

### 1. Edge Function — `supabase/functions/send-email-notification/index.ts`
Add `Period: {{review_period}} {{review_year}}` line to all KPI-related default templates that currently lack it. The following templates need the period added after the KRA/KPI lines:

| Template | Currently Has Period? |
|---|---|
| `kpi_submitted` | Yes |
| `manager_approved` | No — add |
| `manager_rejected` | No — add |
| `query_raised` | No — add |
| `query_resolved` | No — add |
| `final_approved` | No — add |
| `kra_assigned` | Yes |
| `kpi_ready_for_audit` | No — add |
| `kpi_ready_for_management` | No — add |
| `query_response_received` | No — add |
| `admin_status_change` | No — add |
| `admin_data_entry` | No — add |
| `admin_data_override` | No — add |
| `org_kpi_sent_back` | No — add |
| `admin_status_step_back` | No — add |
| `rollback_requested` | No — add |
| `rollback_approved` | No — add |
| `rollback_rejected` | No — add |
| Observation templates | No — add |

For each, insert `Period: {{review_period}} {{review_year}}` after the KPI/KRA line block.

### 2. Frontend — `src/components/admin/EmailTemplateEditor.tsx`
Mirror the same period line additions in the default body templates shown in the Email Template Editor UI, so admins see the updated defaults when customizing.

### 3. Documentation
Update `DOCUMENTATION.md` to note that all KPI-related email templates now include period context.

## Risk Assessment
- **Data Impact**: None — no schema changes; `review_period` and `review_year` are already passed in the payload
- **Regression Risk**: Minimal — only adds text to templates; existing custom templates saved by admins are unaffected (they use stored overrides)
- **UI/UX**: Improves clarity for all email recipients

