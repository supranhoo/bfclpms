## Add Download Excel Button to Email Logs

Add a "Download Excel" button to the Email Logs page that exports filtered email logs for a user-selected date range — without loading the data into the UI table.

### UI changes (`src/pages/admin/EmailLogs.tsx`)

Add to the filter row (next to refresh button):
- **Date range picker** (From / To dates, defaults to last 7 days)
- **Download Excel button** (with download icon)

The button respects existing Status and Event Type filters (but uses the date range, not the 500-row UI cap).

### Download behavior

On click:
1. Query `email_logs` directly via Supabase using:
   - `created_at >= fromDate AND created_at <= toDate`
   - Apply current `statusFilter` and `eventFilter` if not "all"
   - Use `fetchAll` paged helper (`src/lib/fetchAll.ts`) to bypass 1000-row limit
   - Order by `created_at DESC`
2. Build XLSX with `xlsx` library (already used in project — see `OrgKpiBulkExport.tsx`)
3. Columns: Timestamp, Event, Recipient Name, Recipient Email, Subject, Status, Provider, Error Message, Metadata (JSON string)
4. Filename: `Email_Logs_{from}_to_{to}.xlsx`
5. Show toast on success/failure; show loading state on button while fetching.

### Notes
- No change to the existing 500-row UI query — the download path fetches independently on demand.
- Reuse `EVENT_LABELS` for human-readable event names in the export.
- Use shadcn `Popover` + `Calendar` for date range selection (already in project).
