import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * stability. Use to throttle expensive recomputations or network calls driven
 * by fast-changing inputs (search boxes, sliders, filter chips).
 *
 * Example:
 *   const [search, setSearch] = useState('');
 *   const debounced = useDebouncedValue(search, 300);
 *   const filtered = useMemo(() => list.filter(x => x.includes(debounced)), [list, debounced]);
 *
 * Codified in POLICY.md §120 — Lean-Load Policy.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
