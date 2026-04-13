import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Search, AlertTriangle, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatKpiInsertError } from '@/lib/kpiErrorUtils';


const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface CopyKrasDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SourceKpi {
  id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  target_value: number | null;
  uom: string | null;
  uom_type: string | null;
  weightage: number | null;
  frequency: string | null;
  sub_frequency: string | null;
  criteria: string | null;
  source_of_data: string | null;
  r0: string | null;
  r1: string | null;
  r2: string | null;
  r3: string | null;
  r4: string | null;
  r5: string | null;
  threshold_mode: string | null;
  qualitative_options: any;
  is_org_level: boolean | null;
  org_level_scope: string | null;
  ref_code: string | null;
  day_count_type: string | null;
  frequency_cycle_start: string | null;
  require_resubmit_reason: boolean | null;
  kra_categories?: { name: string } | null;
}

interface Employee {
  id: string;
  name: string;
  code: string;
  department: string;
}

export function CopyKrasDialog({ isOpen, onClose }: CopyKrasDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();

  // Source state
  const [sourceEmployeeId, setSourceEmployeeId] = useState('');
  const [sourcePeriod, setSourcePeriod] = useState(MONTHS[now.getMonth()]);
  const [sourceYear, setSourceYear] = useState(now.getFullYear());
  const [sourceSearch, setSourceSearch] = useState('');

  // KRA selection
  const [selectedKraIds, setSelectedKraIds] = useState<Set<string>>(new Set());

  // Target state
  const [targetEmployeeIds, setTargetEmployeeIds] = useState<string[]>([]);
  const [targetPeriod, setTargetPeriod] = useState(MONTHS[now.getMonth()]);
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [targetSearch, setTargetSearch] = useState('');

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['copy-kras-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, departments:department_id(name)')
        .order('full_name');
      return (data || []).map((e: any) => ({
        id: e.id,
        name: e.full_name || e.id,
        code: e.employee_code || '',
        department: e.departments?.name || '',
      }));
    },
    enabled: isOpen,
  });

  // Fetch source employee's KPIs
  const { data: sourceKpis = [], isLoading: sourceKpisLoading } = useQuery<SourceKpi[]>({
    queryKey: ['copy-kras-source', sourceEmployeeId, sourcePeriod, sourceYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('kpis')
        .select('id, category_id, kra_name, kpi_name, target_value, uom, uom_type, weightage, frequency, sub_frequency, criteria, source_of_data, r0, r1, r2, r3, r4, r5, threshold_mode, qualitative_options, is_org_level, org_level_scope, ref_code, day_count_type, frequency_cycle_start, require_resubmit_reason, kra_categories(name)')
        .eq('employee_id', sourceEmployeeId)
        .eq('review_period', sourcePeriod)
        .eq('review_year', sourceYear);
      return (data || []) as SourceKpi[];
    },
    enabled: !!sourceEmployeeId,
  });

  // Auto-select all when source KPIs load
  useMemo(() => {
    if (sourceKpis.length > 0 && selectedKraIds.size === 0) {
      setSelectedKraIds(new Set(sourceKpis.map(k => k.id)));
    }
  }, [sourceKpis]);

  // Fetch target employees' existing KPIs for duplicate detection
  const { data: targetExistingKpis = [] } = useQuery({
    queryKey: ['copy-kras-target-existing', targetEmployeeIds, targetPeriod, targetYear],
    queryFn: async () => {
      if (targetEmployeeIds.length === 0) return [];
      const { data } = await supabase
        .from('kpis')
        .select('employee_id, kra_name, kpi_name')
        .in('employee_id', targetEmployeeIds)
        .eq('review_period', targetPeriod)
        .eq('review_year', targetYear);
      return data || [];
    },
    enabled: targetEmployeeIds.length > 0,
  });

  // Build duplicate map: employee_id -> Set of "kra_name|||kpi_name"
  const duplicateMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    targetExistingKpis.forEach(k => {
      const key = `${k.kra_name}|||${k.kpi_name}`;
      if (!map.has(k.employee_id)) map.set(k.employee_id, new Set());
      map.get(k.employee_id)!.add(key);
    });
    return map;
  }, [targetExistingKpis]);

  // Count duplicates per target employee
  const duplicateCounts = useMemo(() => {
    const selectedKpis = sourceKpis.filter(k => selectedKraIds.has(k.id));
    const counts: Record<string, number> = {};
    targetEmployeeIds.forEach(empId => {
      const existing = duplicateMap.get(empId);
      if (!existing) { counts[empId] = 0; return; }
      counts[empId] = selectedKpis.filter(k => existing.has(`${k.kra_name}|||${k.kpi_name}`)).length;
    });
    return counts;
  }, [sourceKpis, selectedKraIds, targetEmployeeIds, duplicateMap]);

  const totalDuplicates = Object.values(duplicateCounts).reduce((a, b) => a + b, 0);

  // Filtered employee lists
  const filteredSourceEmployees = useMemo(() => {
    if (!sourceSearch) return employees;
    const q = sourceSearch.toLowerCase();
    return employees.filter(e => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  }, [employees, sourceSearch]);

  const filteredTargetEmployees = useMemo(() => {
    const filtered = employees.filter(e => e.id !== sourceEmployeeId);
    if (!targetSearch) return filtered;
    const q = targetSearch.toLowerCase();
    return filtered.filter(e => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
  }, [employees, sourceEmployeeId, targetSearch]);

  // Copy mutation
  const copyMutation = useMutation({
    mutationFn: async () => {
      const selectedKpis = sourceKpis.filter(k => selectedKraIds.has(k.id));
      const kpisToInsert: any[] = [];

      targetEmployeeIds.forEach(empId => {
        const existing = duplicateMap.get(empId) || new Set();
        selectedKpis.forEach(kpi => {
          const compositeKey = `${kpi.kra_name}|||${kpi.kpi_name}`;
          if (existing.has(compositeKey)) return; // skip duplicate

          kpisToInsert.push({
            employee_id: empId,
            category_id: kpi.category_id,
            kra_name: kpi.kra_name,
            kpi_name: kpi.kpi_name,
            target_value: kpi.target_value,
            uom: kpi.uom,
            uom_type: kpi.uom_type,
            weightage: kpi.weightage,
            frequency: kpi.frequency,
            sub_frequency: kpi.sub_frequency,
            criteria: kpi.criteria,
            source_of_data: kpi.source_of_data,
            r0: kpi.r0,
            r1: kpi.r1,
            r2: kpi.r2,
            r3: kpi.r3,
            r4: kpi.r4,
            r5: kpi.r5,
            threshold_mode: kpi.threshold_mode,
            qualitative_options: kpi.qualitative_options,
            is_org_level: kpi.is_org_level,
            org_level_scope: kpi.org_level_scope,
            ref_code: kpi.ref_code,
            day_count_type: kpi.day_count_type,
            frequency_cycle_start: kpi.frequency_cycle_start,
            require_resubmit_reason: kpi.require_resubmit_reason,
            review_period: targetPeriod,
            review_year: targetYear,
            status: 'kra_set',
          });
        });
      });

      if (kpisToInsert.length === 0) throw new Error('No KPIs to copy (all duplicates).');

      const { error } = await supabase.from('kpis').insert(kpisToInsert);
      if (error) throw error;

      // Create org_kpi_values placeholder rows for employee-scoped org KPIs
      const orgKpiValuesToInsert: any[] = [];
      kpisToInsert.forEach(kpi => {
        if (kpi.is_org_level && kpi.org_level_scope === 'employee') {
          orgKpiValuesToInsert.push({
            category_id: kpi.category_id,
            kra_name: kpi.kra_name,
            kpi_name: kpi.kpi_name,
            review_period: kpi.review_period,
            review_year: kpi.review_year,
            employee_id: kpi.employee_id,
            target_value: kpi.target_value,
            uom_type: kpi.uom_type,
            criteria: kpi.criteria,
            qualitative_options: kpi.qualitative_options,
            r0: kpi.r0,
            r1: kpi.r1,
            r2: kpi.r2,
            r3: kpi.r3,
            r4: kpi.r4,
            r5: kpi.r5,
            status: 'entered',
          });
        }
      });

      if (orgKpiValuesToInsert.length > 0) {
        const { error: orgError } = await supabase
          .from('org_kpi_values')
          .upsert(orgKpiValuesToInsert, { onConflict: 'category_id,kra_name,kpi_name,review_period,review_year,employee_id', ignoreDuplicates: true });
        if (orgError) console.warn('Failed to create org_kpi_values placeholders:', orgError.message);
      }

      return kpisToInsert.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-full-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owner-names'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      toast({ title: `Copied ${count} KRAs to ${targetEmployeeIds.length} employee(s)` });

      // Email deferred to "Issue KRAs" confirmation step

      handleClose();
    },
    onError: (err: any) => {
      toast({ title: 'Copy Failed', description: formatKpiInsertError(err), variant: 'destructive' });
    },
  });

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSourceEmployeeId('');
      setSelectedKraIds(new Set());
      setTargetEmployeeIds([]);
      setSourceSearch('');
      setTargetSearch('');
    }, 300);
  };

  const toggleKra = (id: string) => {
    setSelectedKraIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKraIds.size === sourceKpis.length) {
      setSelectedKraIds(new Set());
    } else {
      setSelectedKraIds(new Set(sourceKpis.map(k => k.id)));
    }
  };

  const toggleTargetEmployee = (id: string) => {
    setTargetEmployeeIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const sourceEmployee = employees.find(e => e.id === sourceEmployeeId);
  const totalToCopy = selectedKraIds.size * targetEmployeeIds.length - totalDuplicates;
  const canCopy = selectedKraIds.size > 0 && targetEmployeeIds.length > 0 && totalToCopy > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy KRAs
          </DialogTitle>
          <DialogDescription>
            Select a source employee, pick KRAs, and assign them to target employee(s).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4" type="always">
          <div className="space-y-6 py-2">
            {/* Steps 1 & 3 side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Step 1: Source Employee */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Step 1: Source Employee & Period</Label>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Input
                      placeholder="Search employee..."
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      className="text-sm"
                    />
                    {sourceSearch && !sourceEmployeeId && (
                      <div className="border rounded-md max-h-48 overflow-y-auto">
                        {filteredSourceEmployees.slice(0, 20).map(emp => (
                          <button
                            key={emp.id}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 flex items-center gap-2"
                            onClick={() => {
                              setSourceEmployeeId(emp.id);
                              setSourceSearch(emp.name);
                              setSelectedKraIds(new Set());
                            }}
                          >
                            <span>{emp.name}</span>
                            {emp.code && <Badge variant="outline" className="text-xs">{emp.code}</Badge>}
                          </button>
                        ))}
                      </div>
                    )}
                    {sourceEmployee && (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">{sourceEmployee.name}</Badge>
                        <button className="text-xs text-muted-foreground underline" onClick={() => { setSourceEmployeeId(''); setSourceSearch(''); setSelectedKraIds(new Set()); }}>
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={sourcePeriod} onValueChange={setSourcePeriod}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={String(sourceYear)} onValueChange={v => setSourceYear(Number(v))}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Step 3: Target Employees */}
              {selectedKraIds.size > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Step 3: Target Employee(s) & Period</Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search target employees..."
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                      className="text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={targetPeriod} onValueChange={setTargetPeriod}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={String(targetYear)} onValueChange={v => setTargetYear(Number(v))}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    {filteredTargetEmployees.slice(0, 50).map(emp => {
                      const dupCount = duplicateCounts[emp.id] || 0;
                      return (
                        <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                          <Checkbox
                            checked={targetEmployeeIds.includes(emp.id)}
                            onCheckedChange={() => toggleTargetEmployee(emp.id)}
                          />
                          <span className="text-sm font-medium">{emp.name}</span>
                          {emp.code && <Badge variant="outline" className="text-xs">{emp.code}</Badge>}
                          <span className="text-xs text-muted-foreground ml-auto">{emp.department}</span>
                          {dupCount > 0 && targetEmployeeIds.includes(emp.id) && (
                            <Badge variant="secondary" className="text-xs shrink-0">{dupCount} dup</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">{targetEmployeeIds.length} employee(s) selected</p>

                  {totalDuplicates > 0 && (
                    <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <AlertDescription className="text-sm">
                        {totalDuplicates} duplicate KRA(s) will be skipped (already assigned for the target period).
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Select KRAs — full width */}
            {sourceEmployeeId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Step 2: Select KRAs ({selectedKraIds.size}/{sourceKpis.length})</Label>
                  {sourceKpis.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-xs h-7">
                      {selectedKraIds.size === sourceKpis.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>

                {sourceKpisLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading KRAs...
                  </div>
                ) : sourceKpis.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No KRAs found for this employee/period.</p>
                ) : (
                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    {sourceKpis.map(kpi => (
                      <label key={kpi.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                        <Checkbox
                          checked={selectedKraIds.has(kpi.id)}
                          onCheckedChange={() => toggleKra(kpi.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{kpi.kra_categories?.name || 'N/A'}</span>
                          <span className="text-muted-foreground text-sm"> › {kpi.kpi_name}</span>
                        </div>
                        {kpi.weightage != null && (
                          <Badge variant="outline" className="text-xs shrink-0">Wt: {kpi.weightage}%</Badge>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => copyMutation.mutate()}
            disabled={!canCopy || copyMutation.isPending}
          >
            {copyMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Copying...</>
            ) : (
              <><Copy className="h-4 w-4 mr-2" />Copy {totalToCopy > 0 ? totalToCopy : ''} KRA{totalToCopy !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
