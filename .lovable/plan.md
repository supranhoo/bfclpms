

# Fix: Page Performance & Sign-In "Failed to Fetch" (v1.46.12)

## Issue 1: Sign-In "Failed to Fetch"

### Root Cause
The error "Failed to fetch" is a **network-level failure** -- the browser's `fetch()` call to the Supabase auth endpoint never received a response. This is distinct from an auth error (wrong password, etc.). The most likely cause on the custom domain (`pms.bfclalloys.com`) is **DNS resolution delay** for `jdvsvqiyptijplyhmqqn.supabase.co` compounding with the 780ms redirect from `bfclpms.lovable.app` to `pms.bfclalloys.com`, causing timeouts on slow networks.

### Fix
1. **Add preconnect hint for Supabase** in `index.html` -- this establishes DNS + TCP + TLS early, saving ~300ms (confirmed by Lighthouse recommendation).
2. **Add retry logic with user feedback** in the `signIn` function in `AuthContext.tsx` -- catch "Failed to fetch" specifically and show a more helpful message suggesting the user check their network and try again.

---

## Issue 2: Page Loading Time (Performance Score: 80)

Lighthouse identified several bottlenecks. Here are the actionable fixes:

### A. Add Supabase Preconnect (index.html)
Add `<link rel="preconnect" href="https://jdvsvqiyptijplyhmqqn.supabase.co" crossorigin />` to the `<head>`. Lighthouse estimates **~300ms LCP savings**.

### B. Switch Google Fonts to `display=swap` + Preload Critical Font (index.html)
The 3 Google Font CSS files are render-blocking (~900ms). Add `media="print" onload` pattern or use `font-display: swap` (already set via `display=swap` in the URL, but the CSS files themselves block rendering). We can add `<link rel="preload">` for the primary Inter font to reduce the critical chain from 761ms.

### C. Optimize Login Background Image
The background image is a 1.9MB PNG. The `LoginSlideshow` and mobile background in `Auth.tsx` load this via CSS `background-image`. We should add `loading="lazy"` behavior by deferring the image load until after first paint, or recommend converting the image to WebP format via the storage bucket (manual step for the admin).

### D. Improve Sign-In Error Messaging
Catch network errors distinctly from auth errors to give users actionable feedback.

---

## Files to Change

| File | Change |
|------|--------|
| `index.html` | Add preconnect for Supabase origin |
| `src/contexts/AuthContext.tsx` | Improve `signIn` error handling for network failures |
| `src/pages/Auth.tsx` | Add font preload hints; defer mobile background image |

## Technical Details

### index.html (line 8, after existing preconnects)
```html
<link rel="preconnect" href="https://jdvsvqiyptijplyhmqqn.supabase.co" crossorigin />
```

### AuthContext.tsx - signIn function
Wrap the `signIn` call in a try-catch to distinguish network errors:
```typescript
const signIn = async (email: string, password: string) => {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    }
    return { error };
  } catch (networkError) {
    const err = new Error('Network error. Please check your internet connection and try again.');
    toast({
      title: "Sign in failed",
      description: err.message,
      variant: "destructive",
    });
    return { error: err };
  }
};
```

### Auth.tsx - Defer mobile background image
Instead of loading the 1.9MB background immediately via inline `style`, use a state-based approach that loads it after the component mounts:
```typescript
const [bgLoaded, setBgLoaded] = useState(false);
useEffect(() => {
  if (wallpapers.length > 0) {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = wallpapers[0];
  }
}, [wallpapers]);
```
Then conditionally apply the background-image style only when `bgLoaded` is true.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | No DB or schema changes |
| Regression | None | Preconnect is purely additive; try-catch is defensive |
| UX | Positive | Faster perceived load, better error messages |
| Auth flow | None | Only error handling changes, core logic unchanged |

