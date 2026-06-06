import { useEffect } from 'react';

/**
 * Registers a `beforeunload` warning while `dirty` is true.
 * Used by Org KPI Data Entry (ADR-075) to guard against accidental
 * navigation/closure when the user has unsaved field edits.
 */
export function useUnsavedChanges(dirty: boolean, message = 'You have unsaved changes. Leave anyway?') {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the custom string but require returnValue to be set.
      e.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, message]);
}