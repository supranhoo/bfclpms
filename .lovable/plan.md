## Problem
The **Backup History** UI shows a size (e.g., 94.3 MB) that comes from `backup_logs.file_size_bytes`. This value is the sum of raw per-table chunk JSON byte sizes computed during backup creation. However, when a user downloads the same backup, the assembled file is ~25–40% larger (e.g., ~127 MB) because `useDownloadBackup` re-serializes the data with `JSON.stringify(..., null, 2)` — adding whitespace indentation and line breaks.

## Fix
Remove the `null, 2` pretty-print arguments from `JSON.stringify` inside `useDownloadBackup` so the downloaded file is compact JSON, matching the byte count stored in `backup_logs.file_size_bytes`.

## Files changed
- `src/hooks/useBackups.ts` — line 448-451

## Details
### Before
```ts
const combinedJson = JSON.stringify({
  metadata: { ...manifest, tables: undefined },
  data: combinedData,
}, null, 2);
```

### After
```ts
const combinedJson = JSON.stringify({
  metadata: { ...manifest, tables: undefined },
  data: combinedData,
});
```

## Impact
- Downloaded file size will now closely match the UI-reported size.
- Restore logic is unaffected — it reads the same assembled structure regardless of formatting.
- No backend or database changes required.
- No test changes needed (no existing test coverage for `useDownloadBackup`).