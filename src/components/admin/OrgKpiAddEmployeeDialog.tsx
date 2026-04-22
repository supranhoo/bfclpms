import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAddEmployeesToOrgKpi } from '@/hooks/useOrgKpiManagement';
import { fetchAllPaged } from '@/lib/fetchAll';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  existingEmployeeIds: string[];
}

export function OrgKpiAddEmployeeDialog({
  open, onOpenChange,
  categoryId, kraName, kpiName,
  reviewPeriod, reviewYear,
  existingEmployeeIds,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const addMutation = useAddEmployeesToOrgKpi();

  type EmployeeRow = {
    id: string;
    full_name: string | null;
    employee_code: string | null;
    department_id: string | null;
    designation: string | null;
    departments: { id: string; name: string } | null;
  };

  // Fetch all employees
  const { data: allEmployees, isLoading } = useQuery<EmployeeRow[]>({
    queryKey: ['all-employees-for-org-kpi-assign'],
    queryFn: async (): Promise<EmployeeRow[]> => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap so employees
      // beyond row ~1000 (full active roster) remain searchable.
      const data = await fetchAllPaged<EmployeeRow>((from, to) =>
        (supabase as any)
          .from('profiles')
          .select('id, full_name, employee_code, department_id, designation, departments(id, name)')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );
      return data;
    },
    enabled: open,
  });

  const existingSet = useMemo(() => new Set(existingEmployeeIds), [existingEmployeeIds]);

  const departments = useMemo(() => {
    if (!allEmployees) return [];
    const deptMap = new Map<string, string>();
    allEmployees.forEach(e => {
      const dept = e.departments;
      if (dept) deptMap.set(dept.id, dept.name);
    });
    return Array.from(deptMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees]);

  const available = useMemo(() => {
    if (!allEmployees) return [];
    return allEmployees.filter(e => {
      if (existingSet.has(e.id)) return false;
      if (deptFilter !== 'all' && e.department_id !== deptFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (e.full_name?.toLowerCase().includes(q)) ||
               (e.employee_code?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allEmployees, existingSet, search, deptFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    await addMutation.mutateAsync({
      identifier: { categoryId, kraName, kpiName, reviewPeriod, reviewYear },
      employeeIds: Array.from(selectedIds),
    });
    setSelectedIds(new Set());
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Employees to Org KPI
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{kpiName}</span> — {kraName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 max-h-[350px] border rounded-md">
            <div className="p-2 space-y-1">
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {search || deptFilter !== 'all' ? 'No matching employees found' : 'All employees already assigned'}
                </p>
              ) : (
                available.map(emp => {
                  const dept = (emp as any).departments;
                  return (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(emp.id)}
                        onCheckedChange={() => toggleSelect(emp.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{emp.full_name}</span>
                        {emp.employee_code && (
                          <span className="text-xs text-muted-foreground ml-1">({emp.employee_code})</span>
                        )}
                      </div>
                      {dept?.name && (
                        <Badge variant="outline" className="text-xs shrink-0">{dept.name}</Badge>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || addMutation.isPending}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Add {selectedIds.size > 0 ? `${selectedIds.size} Employee${selectedIds.size > 1 ? 's' : ''}` : 'Selected'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
