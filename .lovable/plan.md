

# Fix: File Upload Duplicating Across Multiple Org KPI Cards

## Root Cause

The bug is in `OrgKpiFileUpload.tsx` -- specifically the **clipboard paste listener** (lines 65-92).

When the Org KPI Data Entry page renders multiple KPI cards, each card contains its own `OrgKpiFileUpload` component. Every instance that doesn't already have a file (`existingUrl` is null) registers a paste event listener on the **same target** -- `document` (since the cards are NOT inside a dialog).

When Biswajit pastes a file (Ctrl+V) or even when the paste event fires for any reason, **ALL** upload instances without an existing file process the event simultaneously. Each one independently uploads the same file and calls its own `onUploadComplete`, causing the file to appear on multiple KPI cards at once.

The `e.preventDefault()` call does NOT stop other listeners from firing -- it only prevents the browser's default paste behavior. Event propagation continues to all listeners.

## Fix

### File: `src/components/admin/OrgKpiFileUpload.tsx`

**Change:** After the first `OrgKpiFileUpload` instance handles a paste event, use `e.stopImmediatePropagation()` to prevent other instances' listeners from also processing the same file.

Replace:
```ts
e.preventDefault();
```

With:
```ts
e.preventDefault();
e.stopImmediatePropagation();
```

This ensures only **one** upload component (the one closest to focus or first in DOM order) processes the pasted file.

### File: `DOCUMENTATION.md`

- Version bump to 1.45.40
- Note: Fixed paste-upload duplicating files across multiple Org KPI cards

## Why This Happens

```text
Page Layout (no dialog wrapper):

  [OrgKpiEntryCard 1] -> OrgKpiFileUpload -> listens on `document` for paste
  [OrgKpiEntryCard 2] -> OrgKpiFileUpload -> listens on `document` for paste
  [OrgKpiEntryCard 3] -> OrgKpiFileUpload -> listens on `document` for paste

  User pastes a file:
  -> ALL 3 listeners fire
  -> ALL 3 upload the same file
  -> ALL 3 call onUploadComplete
```

After fix with `stopImmediatePropagation`:
```text
  User pastes a file:
  -> Listener 1 fires, uploads file, stops propagation
  -> Listeners 2 and 3 never fire
```

## What Will NOT Change

- Click-based upload (via the "Upload" button) -- this already works correctly since each component has its own file input
- EvidenceUpload and MultiFileUpload components in review sheets -- these are inside dialogs (only one open at a time), so the paste duplication doesn't occur there
- No database or schema changes needed

