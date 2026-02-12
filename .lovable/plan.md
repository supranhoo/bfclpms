

# Fix: "Performance Management" Module Not Showing After Login

## Root Cause

**Race condition between authentication and data fetching.**

After login, the app redirects to the Module Hub before the authentication token is fully propagated to the HTTP client. The modules query fires with no valid token, RLS blocks it (returns empty), and React Query caches that empty result for 5 minutes. A page refresh works because the token is already established.

## Fix

### 1. Guard `useModules()` with auth state

**File: `src/hooks/useModules.ts`**

Add an `enabled` flag so the query only runs when authentication is confirmed:

```typescript
import { useAuth } from '@/contexts/AuthContext';

export function useModules() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['modules'],
    queryFn: async (): Promise<Module[]> => {
      // ... existing code ...
    },
    enabled: !!user, // Only fetch when authenticated
    staleTime: 1000 * 60 * 5,
  });
}
```

### 2. Guard `useAppSettings()` the same way (preventive)

**File: `src/hooks/useAppSettings.ts`**

The `app_settings` table likely has similar RLS. Guard it too, but since it's used on the login page (before auth), make it conditional:

```typescript
export function useAppSettings(requireAuth = false) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['app-settings'],
    queryFn: async (): Promise<AppSettings | null> => { ... },
    enabled: requireAuth ? !!user : true,
    staleTime: 1000 * 60 * 5,
  });
}
```

### 3. Invalidate module cache on login

**File: `src/contexts/AuthContext.tsx`**

After successful auth state change (login event), invalidate the modules query so any stale empty cache is cleared:

```typescript
import { useQueryClient } from '@tanstack/react-query';

// Inside AuthProvider:
const queryClient = useQueryClient();

// In onAuthStateChange callback, when session appears:
if (session?.user) {
  queryClient.invalidateQueries({ queryKey: ['modules'] });
  // ... existing fetchProfile/fetchRole calls
}
```

### 4. Update DOCUMENTATION.md

Add a note in the Module Hub section about the auth-guarded query pattern.

## Technical Details

| Item | Detail |
|------|--------|
| Files changed | 3 (`useModules.ts`, `AuthContext.tsx`, `DOCUMENTATION.md`) |
| Risk | None -- display-only change, no data or scoring impact |
| Breaking changes | None |

## Why This Works

- The `enabled: !!user` flag prevents the query from firing before the token is ready
- The cache invalidation ensures that if an empty result was somehow cached, it gets cleared on login
- Together, these two changes eliminate both the race condition and its cached side effects

