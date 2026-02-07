
# Plan: Fix Background Import Progress Not Updating

## Problem Analysis

The background import shows "Importing data in background" indefinitely even when the import has completed. This is caused by a **race condition** in the realtime subscription flow:

```text
Timeline:
0ms    → Edge function returns 202 with importId
1ms    → Frontend receives response
5ms    → Frontend sets backgroundImportId state  
20ms   → useEffect triggers, starts subscription
50ms   → Initial fetchProgress() call - may fetch 'running' status
80ms   → Realtime subscription fully established
1000ms → Import completes, UPDATE event fires

But for fast imports (< 100ms total):
0ms    → Edge function returns 202
50ms   → Import ALREADY COMPLETES in background
80ms   → Frontend finally subscribes to realtime
         → Misses the UPDATE because it already happened!
```

The import of 9 rows completes in ~1 second, which is often faster than the frontend can establish the realtime subscription.

---

## Root Causes

1. **No polling fallback**: Only relies on realtime which can miss events
2. **Race condition**: Subscription may be established after import completes
3. **Initial fetch timing**: Single fetch at subscription start may catch intermediate state

---

## Solution

Implement a **polling fallback with interval** that runs alongside realtime:

1. Add a polling interval (every 2 seconds) that fetches progress status
2. Clear interval when import completes or fails
3. Keep realtime subscription as primary (faster for slow imports)
4. Polling ensures completion is detected even if realtime event is missed

---

## Implementation

### Update useEffect in ImportData.tsx

```tsx
useEffect(() => {
  if (!backgroundImportId) return;

  // Shared function to update progress
  const updateProgressState = (data: any) => {
    const progress: BackgroundImportProgress = {
      id: data.id,
      status: data.status as 'running' | 'completed' | 'failed',
      total_rows: data.total_rows,
      processed_rows: data.processed_rows,
      kpis_imported: data.kpis_imported,
      employees_created: data.employees_created,
      categories_created: data.categories_created,
      errors: typeof data.errors === 'string' ? JSON.parse(data.errors) : (data.errors || []),
      started_at: data.started_at,
      completed_at: data.completed_at,
    };
    setBackgroundProgress(progress);

    if (progress.status === 'completed' || progress.status === 'failed') {
      // Refresh data when import completes
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
      // ... other invalidations

      if (progress.status === 'completed') {
        setImportSuccess(progress.kpis_imported);
        toast({
          title: 'Import Complete',
          description: `Successfully imported ${progress.kpis_imported} KPIs...`,
        });
      }
      return true; // Signal completion
    }
    return false;
  };

  // Polling fetch function
  const fetchProgress = async (): Promise<boolean> => {
    const { data } = await supabase
      .from('import_progress')
      .select('*')
      .eq('id', backgroundImportId)
      .single();

    if (data) {
      return updateProgressState(data);
    }
    return false;
  };

  // Initial fetch
  fetchProgress();

  // Polling interval as fallback (every 2 seconds)
  const pollInterval = setInterval(async () => {
    const completed = await fetchProgress();
    if (completed) {
      clearInterval(pollInterval);
    }
  }, 2000);

  // Subscribe to real-time updates (primary, faster for slow imports)
  const channel = supabase
    .channel(`import-progress-${backgroundImportId}`)
    .on('postgres_changes', {...}, (payload) => {
      const completed = updateProgressState(payload.new);
      if (completed) {
        clearInterval(pollInterval); // Stop polling when realtime catches it
      }
    })
    .subscribe();

  return () => {
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
}, [backgroundImportId, queryClient, toast]);
```

---

## Additional Improvement: Delay Initial Toast

The "Import Started" toast appears immediately when the import begins. For very fast imports, this toast may still be visible when import completes, causing confusion. We can:

1. Show the completion toast (which will supersede any visible toasts)
2. This is already handled correctly - no additional change needed

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/admin/ImportData.tsx` | Add polling interval as fallback to realtime subscription |

---

## Technical Flow After Fix

```text
0ms     → Edge function returns 202
20ms    → Frontend sets backgroundImportId
50ms    → useEffect triggers:
          → Initial fetchProgress() (may show 'running')
          → Starts polling every 2s
          → Subscribes to realtime
1000ms  → Import completes

Case A (realtime works):
1000ms  → Realtime UPDATE received
          → Progress updated to 'completed'
          → Poll interval cleared
          → Toast shown ✓

Case B (realtime missed):
1000ms  → Import completes (UPDATE event missed)
2000ms  → Poll runs, fetches 'completed' status
          → Progress updated
          → Poll interval cleared
          → Toast shown ✓
```

---

## Testing Checklist

- [ ] Start a KPI import with a small file (9 rows)
- [ ] Verify progress shows "Importing data in background"
- [ ] Verify progress updates to "Import Complete!" within 5 seconds
- [ ] Verify KPI counts show correct values
- [ ] Verify "Dismiss" button appears after completion
- [ ] Test with larger file (slower import) to verify realtime still works
- [ ] Verify no memory leaks (interval cleared on unmount)
