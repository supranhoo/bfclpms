import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  CustomFieldDef,
  CustomFieldDefInput,
  CustomFieldValues,
  DropdownOption,
} from '@/lib/employeeMasterCustomFields';

const TABLE = 'employee_master_custom_fields' as const;
const VALUES_TABLE = 'employee_master_custom_field_values' as const;

function rowToDef(row: any): CustomFieldDef {
  return {
    id: row.id,
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    is_mandatory: !!row.is_mandatory,
    show_on_add_user: !!row.show_on_add_user,
    show_on_edit_user: !!row.show_on_edit_user,
    show_in_employee_master: !!row.show_in_employee_master,
    dropdown_options: Array.isArray(row.dropdown_options)
      ? (row.dropdown_options as DropdownOption[])
      : null,
    placeholder: row.placeholder ?? null,
    help_text: row.help_text ?? null,
    is_active: !!row.is_active,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface UseCustomFieldDefsOptions {
  /** Only fields with is_active=true. */
  activeOnly?: boolean;
  /** Only fields with show_on_add_user=true. */
  addUserOnly?: boolean;
}

export function useEmployeeMasterCustomFieldDefs(
  opts: UseCustomFieldDefsOptions = {},
) {
  const { activeOnly = false, addUserOnly = false } = opts;
  return useQuery({
    queryKey: ['employee-master-custom-fields', { activeOnly, addUserOnly }],
    queryFn: async (): Promise<CustomFieldDef[]> => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select('*')
        .order('sort_order', { ascending: true })
        .order('field_label', { ascending: true });
      if (error) throw error;
      let rows = (data || []).map(rowToDef);
      if (activeOnly) rows = rows.filter((r) => r.is_active);
      if (addUserOnly) rows = rows.filter((r) => r.show_on_add_user);
      return rows;
    },
    staleTime: 30_000,
  });
}

export function useUpsertEmployeeMasterCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomFieldDefInput & { id?: string }) => {
      const payload: any = {
        field_key: input.field_key,
        field_label: input.field_label,
        field_type: input.field_type,
        is_mandatory: input.is_mandatory,
        show_on_add_user: input.show_on_add_user,
        show_on_edit_user: input.show_on_edit_user,
        show_in_employee_master: input.show_in_employee_master,
        dropdown_options:
          input.field_type === 'dropdown' ? input.dropdown_options ?? [] : null,
        placeholder: input.placeholder || null,
        help_text: input.help_text || null,
        is_active: input.is_active,
        sort_order: input.sort_order ?? 0,
      };
      if (input.id) {
        const { error } = await (supabase as any)
          .from(TABLE)
          .update(payload)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(TABLE).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-master-custom-fields'] });
    },
  });
}

export function useSetEmployeeMasterCustomFieldFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<Pick<CustomFieldDef, 'is_mandatory' | 'is_active'>>;
    }) => {
      const { error } = await (supabase as any)
        .from(TABLE)
        .update(input.patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-master-custom-fields'] });
    },
  });
}

export function useDeleteEmployeeMasterCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from(TABLE)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-master-custom-fields'] });
    },
  });
}

/**
 * Read the stored custom-field values for an employee. Returns an empty
 * object when no row exists.
 */
export function useEmployeeMasterCustomFieldValues(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ['employee-master-custom-field-values', employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<CustomFieldValues> => {
      const { data, error } = await (supabase as any)
        .from(VALUES_TABLE)
        .select('values')
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (error) throw error;
      return (data?.values as CustomFieldValues) || {};
    },
    staleTime: 30_000,
  });
}

/**
 * Upsert the values row for an employee. Caller passes already-normalized
 * values. No-op when `values` is an empty object and no prior row exists.
 */
export async function saveEmployeeMasterCustomFieldValues(
  employeeId: string,
  values: CustomFieldValues,
): Promise<void> {
  const { error } = await (supabase as any)
    .from(VALUES_TABLE)
    .upsert(
      { employee_id: employeeId, values },
      { onConflict: 'employee_id' },
    );
  if (error) throw error;
}