
# Add Ctrl+V Paste-to-Upload Support

## Overview

Add clipboard paste support (Ctrl+V / Cmd+V) to all three file upload components so users can paste screenshots or copied images directly. This is a non-breaking, additive change -- existing click and drag-and-drop flows remain untouched.

## Important Limitation

Clipboard paste primarily works for **images** (screenshots, copied images). Browsers do not support pasting arbitrary files (PDFs, Excel) from the file explorer via Ctrl+V. The implementation will handle this gracefully by showing a toast if the pasted content has no valid files.

## Components to Update

### 1. MultiFileUpload.tsx
- Add an `onPaste` handler on the drop zone `div`
- Extract files from `e.clipboardData.files`
- Feed them into the existing `handleFilesSelected` function (reuses all validation and upload logic)
- Update the help text from "Drop or click" to "Drop, click, or paste"
- Make the drop zone focusable (`tabIndex={0}`) so it can receive paste events

### 2. EvidenceUpload.tsx
- Add an `onPaste` handler on the upload button wrapper `div`
- Extract the first file from `e.clipboardData.files`
- Feed it into the existing `handleFileSelect` logic (reuses validation and upload)
- Add a wrapper div with `tabIndex={0}` to capture paste events
- Update the help text to mention paste support

### 3. OrgKpiFileUpload.tsx
- Add an `onPaste` handler on the outer `div`
- Extract the first file from `e.clipboardData.files`
- Feed it into the existing upload logic (reuses validation and upload)
- Make the container focusable to receive paste events

## Technical Approach

All three components will use the same pattern:

```text
const handlePaste = (e: React.ClipboardEvent) => {
  const files = e.clipboardData?.files;
  if (!files || files.length === 0) return;
  e.preventDefault();
  // Route to existing file handling logic
  handleFilesSelected(files);  // or handleFileSelect for single-file components
};
```

For single-file components (EvidenceUpload, OrgKpiFileUpload), only the first pasted file is used.

## No Impact on Existing Functionality

- Click upload: unchanged
- Drag-and-drop: unchanged (MultiFileUpload only)
- File validation (type, size): reused as-is
- Upload logic and storage paths: unchanged
- No database or schema changes
- No new dependencies

## Files Changed

| File | Change |
|---|---|
| `src/components/ui/MultiFileUpload.tsx` | Add `onPaste` handler on drop zone, update hint text, add `tabIndex` |
| `src/components/ui/EvidenceUpload.tsx` | Add paste handler wrapper, update hint text |
| `src/components/admin/OrgKpiFileUpload.tsx` | Add paste handler on outer div |
| `DOCUMENTATION.md` | Document paste-to-upload support |
