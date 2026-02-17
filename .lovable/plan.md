

# Add Scroll-to-Top Button on All KPIs Page

## Overview

Add a floating "scroll to top" button on the All KPIs page (`/admin/kpis`) that appears when the user scrolls down, allowing them to quickly return to the top of the page at any time -- not just after KRA issuance.

## What Changes

### `src/pages/admin/AllKpis.tsx`

- Add a scroll listener (`useEffect` + `useState`) to track whether the page has been scrolled past a threshold (e.g., 300px).
- Render a floating `<Button>` (bottom-right corner, fixed position) with an `ArrowUp` icon that calls `window.scrollTo({ top: 0, behavior: 'smooth' })`.
- The button fades in/out based on scroll position using opacity and transition classes.

### `DOCUMENTATION.md`

- Note the scroll-to-top button under the All KPIs page section.

## Technical Detail

```typescript
const [showScrollTop, setShowScrollTop] = useState(false);

useEffect(() => {
  const handleScroll = () => setShowScrollTop(window.scrollY > 300);
  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
}, []);
```

Button rendered at the bottom of the component:
```tsx
{showScrollTop && (
  <Button
    size="icon"
    className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
  >
    <ArrowUp className="h-5 w-5" />
  </Button>
)}
```

### Files to Change

| File | Change |
|---|---|
| `src/pages/admin/AllKpis.tsx` | Add scroll listener state and floating scroll-to-top button |
| `DOCUMENTATION.md` | Document scroll-to-top feature |

