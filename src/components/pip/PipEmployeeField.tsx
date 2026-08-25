/**
 * ADR-312 — Employee field for the Create PIP screen.
 *
 * When `/admin/pip/new?employee=<id>` carries an employee, the field renders a
 * confirmed employee card resolved by a single-row lookup (independent of the
 * bulk employee list, so it paints on first render). "Change employee" reveals
 * a searchable picker; an unresolvable id shows an inline destructive message
 * instead of a silently blank control.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound, Pencil, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDescription } from '@/components/ui/form';
import { EmployeePickerCombobox } from '@/components/reviewNotes/EmployeePickerCombobox';
import {
  resolvePipEmployeeFieldState,
  formatPipEmployeeLabel,
  type PipEmployeeLite,
} from '@/lib/pip/pipEmployeeField';

interface Props {
  value: string;
  onChange: (employeeId: string) => void;
  preselectedEmployeeId?: string;
}

export function usePipEmployee(employeeId: string) {
  return useQuery({
    queryKey: ['pip-employee', employeeId],
    enabled: Boolean(employeeId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PipEmployeeLite | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, designation, departments(name)')
        .eq('id', employeeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        full_name: data.full_name,
        employee_code: data.employee_code,
        designation: (data as any).designation ?? null,
        department_name: (data as any).departments?.name ?? null,
      };
    },
  });
}

export function PipEmployeeField({ value, onChange, preselectedEmployeeId }: Props) {
  const [changing, setChanging] = useState(false);
  const { data: resolved, isLoading } = usePipEmployee(value);

  const state = resolvePipEmployeeFieldState({
    value,
    preselectedEmployeeId,
    resolved,
    isResolving: isLoading,
    changing,
  });

  if (state.kind === 'loading') {
    return (
      <div className="rounded-md border border-border p-3" data-testid="pip-employee-loading">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-56" />
      </div>
    );
  }

  if (state.kind === 'confirmed') {
    const e = state.employee;
    return (
      <div
        className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 p-3"
        data-testid="pip-employee-confirmed"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-full bg-background p-1.5 text-muted-foreground">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {formatPipEmployeeLabel(e)}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {[e.designation, e.department_name].filter(Boolean).join(' · ') || 'No designation on record'}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 shrink-0"
          onClick={() => setChanging(true)}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Change employee
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.kind === 'unresolved' && (
        <p className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          The employee carried over could not be loaded (they may be inactive or outside your access).
          Please select an employee.
        </p>
      )}
      <EmployeePickerCombobox
        value={value || null}
        onChange={(id) => {
          onChange(id ?? '');
          if (id) setChanging(false);
        }}
      />
      {preselectedEmployeeId && (
        <FormDescription>
          Changing the employee also changes who the recorded trigger evidence applies to.
        </FormDescription>
      )}
    </div>
  );
}
