

# Fix: Toast Notifications Persist Too Long and Block UI

## Problem
The radix-based toast system (`useToast` / `use-toast.ts`) has `TOAST_REMOVE_DELAY = 1000000` (over 16 minutes). Toasts like "Forwarded successfully" stay on screen indefinitely, blocking buttons underneath. The close button only appears on hover, which is not obvious to users.

## Root Cause
Two issues in `src/hooks/use-toast.ts`:
1. **Line 6**: `TOAST_REMOVE_DELAY = 1000000` — absurdly long timeout, toasts never auto-dismiss
2. The radix `ToastViewport` renders at **bottom-right on desktop** (`sm:bottom-0 sm:right-0`), which overlaps action buttons in review pages

## Fix

### 1. Auto-dismiss after 5 seconds (`use-toast.ts`)
Change `TOAST_REMOVE_DELAY` from `1000000` to `5000` (5 seconds). This makes all radix toasts auto-dismiss.

### 2. Always show close button (`toast.tsx`)
Remove `opacity-0 group-hover:opacity-100` from `ToastClose` so the X button is always visible, not just on hover.

### 3. Move toast position to top-right (`toast.tsx`)
Change `ToastViewport` from bottom-right to **top-right** on all screen sizes. This avoids overlapping action buttons in the review scorecards. Update classes to: `fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col p-4 md:max-w-[420px]`.

**3 lines changed across 2 files. No DB migration.**

