import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateProfileCaches,
  PROFILE_DEPENDENT_QUERY_KEYS,
} from '@/lib/profileCacheKeys';

describe('profile cache invalidation contract', () => {
  it('exposes every cache that depends on profile rows', () => {
    const expected = [
      'profiles',
      'profiles-hierarchy',
      'employee-company-map',
      'companies-for-filter',
      'distinct-designations',
      'distinct-grades',
      'managers-list',
      'monthly-trend',
      'kpi-employee-matrix',
      'admin-reports',
      'employee-filter-options',
    ];
    const flat = PROFILE_DEPENDENT_QUERY_KEYS.map(k => k[0]);
    for (const k of expected) {
      expect(flat).toContain(k);
    }
  });

  it('invalidates every profile-dependent query key', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateProfileCaches(queryClient);

    expect(spy).toHaveBeenCalledTimes(PROFILE_DEPENDENT_QUERY_KEYS.length);
    for (const key of PROFILE_DEPENDENT_QUERY_KEYS) {
      expect(spy).toHaveBeenCalledWith({ queryKey: [...key] });
    }
  });
});
