/**
 * ADR-312 — PIP employee prefill confirmation.
 *
 * Pure state resolver for the "Employee" field on the Create PIP screen.
 * When the employee arrives in the URL the field must render a confirmed
 * employee card (never an empty dropdown the user has to fill again).
 */

export interface PipEmployeeLite {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation?: string | null;
  department_name?: string | null;
}

export type PipEmployeeFieldState =
  /** No prefill (or the user chose to change) — show the searchable picker. */
  | { kind: 'picker' }
  /** Prefilled id still resolving — show a skeleton. */
  | { kind: 'loading' }
  /** Prefilled id resolved — show the confirmed employee card. */
  | { kind: 'confirmed'; employee: PipEmployeeLite }
  /** Prefilled id could not be resolved — show an inline error + picker. */
  | { kind: 'unresolved'; employeeId: string };

export interface ResolveArgs {
  /** Employee id currently held in form state. */
  value: string;
  /** Employee id that came from the URL prefill, if any. */
  preselectedEmployeeId?: string;
  /** Resolved profile for `value`, when known. */
  resolved: PipEmployeeLite | null | undefined;
  /** True while the single-row lookup is in flight. */
  isResolving: boolean;
  /** True once the user asked to change the employee. */
  changing: boolean;
}

export function resolvePipEmployeeFieldState(args: ResolveArgs): PipEmployeeFieldState {
  const { value, resolved, isResolving, changing } = args;
  if (changing || !value) return { kind: 'picker' };
  if (resolved) return { kind: 'confirmed', employee: resolved };
  if (isResolving) return { kind: 'loading' };
  return { kind: 'unresolved', employeeId: value };
}

export function formatPipEmployeeLabel(e: PipEmployeeLite): string {
  const name = e.full_name ?? '—';
  return e.employee_code ? `${name} (${e.employee_code})` : name;
}
