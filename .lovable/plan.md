

# Fix Paste-to-Upload in Dialogs

## Problem

The `onPaste` handler is attached to the drop zone `div` element inside `MultiFileUpload`. This only works when that specific `div` has keyboard focus. Inside a Dialog (like Add Observation), focus is on input fields or the dialog container -- so the paste event never reaches the drop zone.

## Solution

Replace the element-level `onPaste` with a **document-level `paste` event listener** using `useEffect`. This way, pressing Ctrl+V anywhere inside the dialog (or page) while the component is mounted and able to accept files will trigger the upload.

A guard ensures the listener only acts when:
- The component is not disabled
- There are remaining upload slots (`canUploadMore`)
- The pasted clipboard actually contains files

## Changes

### 1. `src/components/ui/MultiFileUpload.tsx`

- Remove the `onPaste` prop from the drop zone `div`
- Add a `useEffect` that attaches a `paste` event listener to `document`
- The listener calls `handleFilesSelected` with clipboard files
- Cleanup removes the listener on unmount or when upload is disabled/full

```text
useEffect(() => {
  if (disabled || !canUploadMore) return;

  const handler = (e: ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    handleFilesSelected(files);
  };

  document.addEventListener('paste', handler);
  return () => document.removeEventListener('paste', handler);
}, [disabled, canUploadMore, handleFilesSelected]);
```

- Keep the `tabIndex={0}` and hint text as-is (no visual changes)

### 2. `src/components/ui/EvidenceUpload.tsx`

- Apply the same document-level listener pattern for consistency

### 3. `src/components/admin/OrgKpiFileUpload.tsx`

- Apply the same document-level listener pattern for consistency

### 4. `DOCUMENTATION.md`

- Note that paste works globally when the upload component is mounted (not just when the drop zone is focused)

## Why This Is Safe

- The listener is only active while the component is mounted and can accept files
- If multiple upload components are on screen simultaneously, each listener fires independently -- but since they all call their own `handleFilesSelected`, the file goes to whichever component is active
- Cleanup on unmount prevents stale listeners
- No database, schema, or RLS changes

