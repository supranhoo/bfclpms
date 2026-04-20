import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A useState-like hook that syncs a filter value with a URL search parameter.
 * Returns [value, setValue] matching the useState API.
 * When value is null/empty, the param is removed from the URL.
 */
export function useUrlFilterState(
  paramName: string,
  defaultValue: string = ''
): [string, (val: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(paramName) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!newValue || newValue === defaultValue) {
            next.delete(paramName);
          } else {
            next.set(paramName, newValue);
          }
          return next;
        },
        { replace: true }
      );
    },
    [paramName, defaultValue, setSearchParams]
  );

  return [value, setValue];
}

/**
 * Nullable variant for filters that use string | null.
 */
export function useUrlFilterStateNullable(
  paramName: string
): [string | null, (val: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(paramName);

  const setValue = useCallback(
    (newValue: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue === null || newValue === '') {
            next.delete(paramName);
          } else {
            next.set(paramName, newValue);
          }
          return next;
        },
        { replace: true }
      );
    },
    [paramName, setSearchParams]
  );

  return [value, setValue];
}

/**
 * Clear all filter-related URL params at once (used by "Clear All" buttons).
 */
export const FILTER_PARAM_NAMES = ['q', 'dept', 'desig', 'grade', 'mgr', 'status', 'auditor', 'page', 'size'] as const;

export function useClearAllFilters() {
  const [, setSearchParams] = useSearchParams();

  return useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        FILTER_PARAM_NAMES.forEach((p) => next.delete(p));
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);
}
