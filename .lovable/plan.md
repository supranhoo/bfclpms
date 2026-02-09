

# Inline Quick Actions for Inbox

## Overview

Add inline quick actions directly in the inbox rows so users can respond to queries, accept responses, and manage notifications without navigating away or opening the detail sheet.

---

## Current Flow vs. Proposed Flow

```text
CURRENT:
  Row Click --> Detail Sheet --> Action Button --> Dialog --> Done

PROPOSED:
  Row Quick Action Button --> Expandable Inline Panel --> Done
  (Detail Sheet still available via "View" button)
```

---

## Changes Required

### 1. Expandable Inline Response Panel (New Component)

Create `src/components/inbox/InlineQuickAction.tsx` -- a collapsible panel that renders below an inbox row when triggered.

**For Queries (status: open, user is recipient):**
```text
┌────────────────────────────────────────────────────────────┐
│ [Textarea: Type your response...]                          │
│ [Attach Evidence]                    [Cancel] [Submit]     │
└────────────────────────────────────────────────────────────┘
```

**For Queries (status: responded, user is raiser):**
```text
┌────────────────────────────────────────────────────────────┐
│ Response: "The target was adjusted per Q3 revision..."     │
│                                 [Dismiss] [Accept Response]│
└────────────────────────────────────────────────────────────┘
```

**For Notifications:**
```text
┌────────────────────────────────────────────────────────────┐
│ [Mark as Read]  [Open in App -->]                          │
└────────────────────────────────────────────────────────────┘
```

### 2. Update InboxRowItem

Add a contextual quick action button that appears on hover/always visible:
- **Open query (recipient):** "Quick Respond" button
- **Responded query (raiser):** "Accept" button  
- **Notification:** "Open" button

Clicking the quick action button expands the `InlineQuickAction` panel below the row instead of opening the detail sheet.

### 3. Update InboxTable

- Track which row's inline panel is expanded via `expandedItemId` state
- Pass expand/collapse handlers and action callbacks down to `InboxRowItem`
- Render the `InlineQuickAction` panel as a full-width table row beneath the expanded item

### 4. Update MobileInboxList

- Same expandable pattern but using card-based layout
- Tap the quick action chip to expand inline panel below the card

### 5. Update QueryInbox (Parent Page)

- Lift the inline response submission logic (currently only in the Dialog) to shared callbacks
- Pass `onInlineRespond` and `onInlineAccept` to `InboxTable`
- Keep the existing Dialog as a fallback for "View Full Details"

### 6. Keyboard Shortcuts

Add keyboard event listener at the `QueryInbox` level:
- **R** - Expand inline respond panel for selected/focused query
- **A** - Accept response for selected query  
- **Escape** - Collapse expanded panel

Focus management: The currently hovered or last-clicked row becomes the "active" row for keyboard shortcuts.

---

## New Files

| File | Purpose |
|------|---------|
| `src/components/inbox/InlineQuickAction.tsx` | Expandable inline action panel component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/inbox/InboxRowItem.tsx` | Add quick action button, expand/collapse props |
| `src/components/inbox/InboxTable.tsx` | Track expanded row, render inline panel |
| `src/components/inbox/MobileInboxList.tsx` | Add inline expand for mobile cards |
| `src/pages/QueryInbox.tsx` | Add keyboard shortcuts, shared inline handlers |
| `src/lib/inboxUtils.ts` | Add helper to determine available quick actions |
| `DOCUMENTATION.md` | Document quick actions feature |

---

## Technical Details

### InlineQuickAction Component Interface

```typescript
interface InlineQuickActionProps {
  item: InboxItem;
  currentUserId: string;
  onSubmitResponse: (itemId: string, notes: string, evidenceUrl?: string) => void;
  onAcceptResponse: (item: InboxItem) => void;
  onNavigate: (path: string) => void;
  onMarkRead: (item: InboxItem) => void;
  onCollapse: () => void;
  isSubmitting?: boolean;
}
```

### Quick Action Button Logic in InboxRowItem

```typescript
function getQuickAction(item: InboxItem, currentUserId: string) {
  if (item.type === 'query') {
    if (item.queryStatus === 'open' && item.toUser?.id === currentUserId)
      return { label: 'Respond', icon: Send, variant: 'default' };
    if (item.queryStatus === 'responded' && item.fromUser?.id === currentUserId)
      return { label: 'Accept', icon: CheckCircle2, variant: 'default' };
  }
  return null; // No quick action for resolved queries or read notifications
}
```

### Keyboard Shortcut Implementation

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    
    switch (e.key.toLowerCase()) {
      case 'r': // Respond to active query
        if (activeItem?.type === 'query' && activeItem.queryStatus === 'open') {
          setExpandedItemId(activeItem.id);
        }
        break;
      case 'a': // Accept response
        if (activeItem?.type === 'query' && activeItem.queryStatus === 'responded') {
          handleInlineAccept(activeItem);
        }
        break;
      case 'escape':
        setExpandedItemId(null);
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeItem]);
```

### Table Row Expansion Pattern

The expanded inline panel renders as a full-width `TableRow` with `colSpan={7}` immediately after the item row, using a collapsible animation via Radix Collapsible.

### Evidence Upload in Inline Panel

The inline response panel uses the existing `EvidenceUpload` component (or `MultiFileUpload` if available) in a compact layout to allow attaching evidence without opening a dialog.

