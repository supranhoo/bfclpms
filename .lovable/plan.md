

# Fix Paste-to-Upload Conflict Between Multiple Upload Components

## Problem

When the "Add Observation" dialog opens inside the SelfReviewSheet, **two** `MultiFileUpload` components are mounted simultaneously:

1. Self-evidence uploader (in the SelfReviewSheet background)
2. Observation evidence uploader (in the AddObservationDialog)

Both register document-level `paste` event listeners. When the user presses Ctrl+V, the **self-evidence listener fires first** and consumes the event, so the observation uploader never receives it. This is why paste appears "not working" in the dialog.

## Solution

Scope the paste listener to the component's **nearest dialog/sheet container** instead of the entire document. Each upload component will:

1. Use a `ref` on its root `div`
2. On mount, walk up the DOM to find the closest `[role="dialog"]` ancestor (used by both Dialog and Sheet)
3. Attach the `paste` listener to that container instead of `document`
4. Fall back to `document` if no dialog ancestor is found (for upload components not inside dialogs)

This way, when the AddObservation dialog is focused (which it is, since Radix traps focus), only its upload component receives the paste event.

## Technical Details

### Pattern (applied to all three upload components)

```text
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (disabled || !canUploadMore) return;

  // Find the closest dialog/sheet container, or fall back to document
  const dialogContainer = containerRef.current?.closest('[role="dialog"]');
  const target = dialogContainer || document;

  const handler = (e: Event) => {
    const ce = e as ClipboardEvent;
    const files = ce.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    handleFilesSelected(files);
  };

  target.addEventListener('paste', handler);
  return () => target.removeEventListener('paste', handler);
}, [disabled, canUploadMore, handleFilesSelected]);
```

### Files Changed

| File | Change |
|---|---|
| `src/components/ui/MultiFileUpload.tsx` | Add containerRef, scope paste listener to nearest `[role="dialog"]` or document |
| `src/components/ui/EvidenceUpload.tsx` | Same scoping pattern |
| `src/components/admin/OrgKpiFileUpload.tsx` | Same scoping pattern |
| `DOCUMENTATION.md` | Update paste-to-upload notes |

## Why This Works

- Radix Dialog/Sheet renders content with `role="dialog"` and traps focus inside it
- Paste events bubble up to the dialog container, where the scoped listener catches them
- The SelfReviewSheet's upload listener is scoped to the Sheet's `[role="dialog"]`, so it does not intercept paste events meant for the AddObservation dialog
- When no dialog ancestor exists (e.g., upload on a regular page), the fallback to `document` ensures paste still works everywhere

## No Breaking Changes

- Click upload: unchanged
- Drag-and-drop: unchanged
- Existing paste behavior on non-dialog pages: unchanged (falls back to document listener)
- No database or schema changes

