import { useCallback, useMemo } from 'react';
import { useUrlFilterState } from '@/hooks/useUrlFilterState';
import {
  employeeStatusExportHeader,
  employeeStatusLabel,
  type EmployeeStatusMode,
} from '@/lib/reportEmployeeFilter';

const VALID: EmployeeStatusMode[] = ['active', 'inactive', 'all'];

/**
 * Shared wiring for the reports-wide Active / Inactive / All employee scope.
 *
 * POLICY §RPT-EMPLOYEE-STATUS-FILTER (ADR-199): every employee-row report
 * exposes the same control, defaults to `active`, persists to `?emp_status=`
 * and stamps the choice into its export.
 */
export function useEmployeeStatusFilter(paramKey = 'emp_status') {
  const [raw, setRaw] = useUrlFilterState(paramKey, 'active');
  const mode = (VALID.includes(raw as EmployeeStatusMode)
    ? raw
    : 'active') as EmployeeStatusMode;

  const setMode = useCallback(
    (next: EmployeeStatusMode) => {
      if (!VALID.includes(next)) return;
      setRaw(next);
    },
    [setRaw],
  );

  return useMemo(
    () => ({
      mode,
      setMode,
      label: employeeStatusLabel(mode),
      exportHeader: employeeStatusExportHeader(mode),
    }),
    [mode, setMode],
  );
}
