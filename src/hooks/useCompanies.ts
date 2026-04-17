import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Company {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
  created_at: string;
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as Company[];
    },
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ name, code }: { name: string; code?: string }) => {
      const { data, error } = await supabase
        .from('companies')
        .insert({ name, code: code || null })
        .select()
        .single();

      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Company created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create company', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, name, code }: { id: string; name: string; code?: string }) => {
      const { data, error } = await supabase
        .from('companies')
        .update({ name, code: code || null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Company updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update company', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: 'Company deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete company', description: error.message, variant: 'destructive' });
    },
  });
}

interface CloneOptions {
  sourceCompanyId: string;
  targetCompanyId: string;
  cloneDivisions: boolean;
  cloneBusinessUnits: boolean;
  cloneDepartments: boolean;
  cloneSubBranches: boolean;
  cloneDesignations: boolean;
  clonePmsGrades: boolean;
  cloneLevels: boolean;
  cloneLocations?: boolean;
}

export function useCloneStructure() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (options: CloneOptions) => {
      const { sourceCompanyId, targetCompanyId } = options;
      const divisionIdMap = new Map<string, string>();
      const buIdMap = new Map<string, string>();
      const deptIdMap = new Map<string, string>();

      // 1. Clone divisions
      if (options.cloneDivisions) {
        const { data: srcDivisions } = await supabase
          .from('divisions')
          .select('*')
          .eq('company_id', sourceCompanyId);

        if (srcDivisions) {
          for (const div of srcDivisions) {
            const { data: newDiv } = await supabase
              .from('divisions')
              .insert({ name: div.name, code: div.code, company_id: targetCompanyId })
              .select()
              .single();
            if (newDiv) divisionIdMap.set(div.id, newDiv.id);
          }
        }
      }

      // 2. Clone business units
      if (options.cloneBusinessUnits && options.cloneDivisions) {
        const { data: srcBUs } = await supabase
          .from('business_units')
          .select('*, divisions!inner(company_id)')
          .eq('divisions.company_id', sourceCompanyId);

        if (srcBUs) {
          for (const bu of srcBUs) {
            const newDivId = bu.division_id ? divisionIdMap.get(bu.division_id) : null;
            const { data: newBU } = await supabase
              .from('business_units')
              .insert({ name: bu.name, code: bu.code, division_id: newDivId || null })
              .select()
              .single();
            if (newBU) buIdMap.set(bu.id, newBU.id);
          }
        }
      }

      // 3. Clone departments
      if (options.cloneDepartments && options.cloneBusinessUnits && options.cloneDivisions) {
        const { data: srcDepts } = await supabase
          .from('departments')
          .select('*, business_units!inner(division_id, divisions!inner(company_id))')
          .eq('business_units.divisions.company_id', sourceCompanyId);

        if (srcDepts) {
          for (const dept of srcDepts) {
            const newBuId = dept.business_unit_id ? buIdMap.get(dept.business_unit_id) : null;
            const { data: newDept } = await supabase
              .from('departments')
              .insert({ name: dept.name, code: dept.code, business_unit_id: newBuId || null })
              .select()
              .single();
            if (newDept) deptIdMap.set(dept.id, newDept.id);
          }
        }
      }

      // 4. Clone sub-branches
      if (options.cloneSubBranches && options.cloneDepartments && options.cloneBusinessUnits && options.cloneDivisions) {
        const srcDeptIds = Array.from(deptIdMap.keys());
        if (srcDeptIds.length > 0) {
          const { data: srcSBs } = await supabase
            .from('sub_branches')
            .select('*')
            .in('department_id', srcDeptIds);

          if (srcSBs) {
            for (const sb of srcSBs) {
              const newDeptId = sb.department_id ? deptIdMap.get(sb.department_id) : null;
              await supabase
                .from('sub_branches')
                .insert({ name: sb.name, code: sb.code, department_id: newDeptId || null });
            }
          }
        }
      }

      // 5. Clone designations
      if (options.cloneDesignations) {
        const { data: srcDesig } = await supabase
          .from('designations')
          .select('*')
          .eq('company_id', sourceCompanyId);

        if (srcDesig) {
          for (const d of srcDesig) {
            await supabase
              .from('designations')
              .insert({ name: d.name, code: d.code, company_id: targetCompanyId });
          }
        }
      }

      // 6. Clone PMS grades
      if (options.clonePmsGrades) {
        const { data: srcGrades } = await supabase
          .from('pms_grades')
          .select('*')
          .eq('company_id', sourceCompanyId);

        if (srcGrades) {
          for (const g of srcGrades) {
            await supabase
              .from('pms_grades')
              .insert({ name: g.name, code: g.code, company_id: targetCompanyId });
          }
        }
      }

      // 7. Clone levels
      if (options.cloneLevels) {
        const { data: srcLevels } = await supabase
          .from('levels' as any)
          .select('*')
          .eq('company_id', sourceCompanyId);

        if (srcLevels) {
          for (const l of srcLevels as any[]) {
            await supabase
              .from('levels' as any)
              .insert({ name: l.name, code: l.code, company_id: targetCompanyId });
          }
        }
      }

      // 8. Clone locations
      if (options.cloneLocations) {
        const { data: srcLocations } = await supabase
          .from('locations' as any)
          .select('*')
          .eq('company_id', sourceCompanyId);

        if (srcLocations) {
          for (const loc of srcLocations as any[]) {
            await supabase
              .from('locations' as any)
              .insert({ name: loc.name, code: loc.code, company_id: targetCompanyId });
          }
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast({ title: 'Structure cloned successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to clone structure', description: error.message, variant: 'destructive' });
    },
  });
}
