

## Plan — Fix Crash When Switching Period to March (Missing statusConfig Entries)

### Root Cause

`OrgKpiEntryCard.tsx` line 369–370:

```ts
const statusInfo = statusConfig[data.status];
const StatusIcon = statusInfo.icon;   // ← throws when status is unknown
```

`statusConfig` is a hardcoded map with only **three** keys: `pending`, `entered`, `propagated`.

The DB actually returns five OKV statuses today:

| Status | Row Count | In `statusConfig`? |
|---|---|---|
| `propagated` | 2271 | ✅ |
| `entered` | 213 | ✅ |
| `approved` | 63 | ❌ **crash** |
| `draft` | 4 | ❌ **crash** (these are the A2-reset Feb OKVs) |
| `pending` | 1 | ✅ |

The `TypeScript` interface (line 46) also lists `'stuck'` which is likewise missing from the map.

When you switch from April to March, the OKV fetch returns rows with `status='draft'` or `status='approved'` (from the v2.66.5 OKV migration helper and the v2.66.6 inheritance work). Looking up `statusConfig['draft']` is `undefined`, and `.icon` blows up the ErrorBoundary → "Something went wrong" screen.

April happens to have only the three "safe" statuses in your test dataset, so it renders fine.

### Fix

**File**: `src/components/admin/OrgKpiEntryCard.tsx`

1. Extend `statusConfig` to include the missing statuses:
   - `draft` → `{ label: 'Draft', icon: FileEdit, variant: 'outline', className: 'text-muted-foreground border-dashed' }`
   - `approved` → `{ label: 'Approved', icon: ShieldCheck, variant: 'default', className: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800' }`
   - `stuck` → `{ label: 'Stuck', icon: AlertTriangle, variant: 'destructive', className: 'text-destructive border-destructive/40' }`
2. Add a defensive fallback so any **future** unknown status never crashes the page:
   ```ts
   const statusInfo = statusConfig[data.status] ?? statusConfig.pending;
   ```
3. Update the TypeScript `status` union (line 46) to match reality: `'pending' | 'entered' | 'propagated' | 'approved' | 'draft' | 'stuck'`.
4. Add the missing icons (`FileEdit`, `ShieldCheck`, `AlertTriangle`) to the lucide-react import.

### Risk & Impact Report

- **Data Impact**: None — display-only fix.
- **Workflow Impact**: None — no business logic change. March will now render correctly with `draft` OKVs visibly badged so admins can identify the four A2-reset Feb values that still need re-entry (see prior loop note).
- **UI/UX**: Adds three new badge variants that match existing design tokens; consistent with the rest of the suite.
- **Regression Risk**: Very low — fallback `?? statusConfig.pending` makes the component crash-proof for any future status value.
- **Mitigation**: Defensive fallback guarantees no future status addition will hard-crash this page again.

### Deliverables

- Patched `OrgKpiEntryCard.tsx` (statusConfig extended + defensive fallback + type union widened + new icon imports).
- DOCUMENTATION.md v2.66.7.1 hotfix note under "Known Issues / Fixes".

