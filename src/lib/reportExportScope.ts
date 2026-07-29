import * as XLSX from 'xlsx';
import {
  employeeStatusExportHeader,
  type EmployeeStatusMode,
} from '@/lib/reportEmployeeFilter';

/**
 * Stamp the active employee scope into an exported worksheet.
 *
 * Appended as a trailing note (rather than prepended) so the header row stays
 * on row 1 and downstream parsers / pivot tables keep working.
 * POLICY §RPT-EMPLOYEE-STATUS-FILTER (ADR-199).
 */
export function appendEmployeeScopeNote(
  ws: XLSX.WorkSheet,
  mode: EmployeeStatusMode,
): XLSX.WorkSheet {
  XLSX.utils.sheet_add_aoa(ws, [[], [employeeStatusExportHeader(mode)]], {
    origin: -1,
  });
  return ws;
}
