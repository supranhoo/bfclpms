import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Search, Building2, Users, GraduationCap, UserPlus, Layers } from 'lucide-react';
import { useDepartments, useBusinessUnits, useDivisions } from '@/hooks/useOrganization';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useProgramMappings, useAddProgramMapping, useRemoveProgramMapping } from '@/hooks/useIncentivePrograms';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  programId: string;
}

export function ProgramEmployeeMapping({ programId }: Props) {
  const { data: mappings = [], isLoading } = useProgramMappings(programId);
  const addMapping = useAddProgramMapping();
  const removeMapping = useRemoveProgramMapping();

  const { data: departments = [] } = useDepartments();
  const { data: businessUnits = [] } = useBusinessUnits();
  const { data: divisions = [] } = useDivisions();
  const { designations, grades } = useEmployeeFilterOptions();

  const [empSearch, setEmpSearch] = useState('');

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['all-employees-for-mapping'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id')
        .eq('is_active', true)
        .order('full_name');
      return data || [];
    },
  });

  const mappingsByType = useMemo(() => {
    const map: Record<string, Set<string>> = {
      division: new Set(),
      department: new Set(),
      business_unit: new Set(),
      designation: new Set(),
      pms_grade: new Set(),
      employee: new Set(),
    };
    mappings.forEach((m: any) => map[m.mapping_type]?.add(m.mapping_value));
    return map;
  }, [mappings]);

  const mappingIdMap = useMemo(() => {
    const map = new Map<string, string>();
    mappings.forEach((m: any) => map.set(`${m.mapping_type}:${m.mapping_value}`, m.id));
    return map;
  }, [mappings]);

  const toggle = (type: string, value: string) => {
    const key = `${type}:${value}`;
    if (mappingIdMap.has(key)) {
      removeMapping.mutate(mappingIdMap.get(key)!);
    } else {
      addMapping.mutate({ program_id: programId, mapping_type: type, mapping_value: value });
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!empSearch) return allEmployees.slice(0, 50);
    const q = empSearch.toLowerCase();
    return allEmployees
      .filter((e: any) =>
        (e.full_name?.toLowerCase().includes(q)) ||
        (e.employee_code?.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [allEmployees, empSearch]);

  const summary = [
    mappingsByType.division.size > 0 && `${mappingsByType.division.size} division(s)`,
    mappingsByType.department.size > 0 && `${mappingsByType.department.size} dept(s)`,
    mappingsByType.business_unit.size > 0 && `${mappingsByType.business_unit.size} BU(s)`,
    mappingsByType.designation.size > 0 && `${mappingsByType.designation.size} designation(s)`,
    mappingsByType.pms_grade.size > 0 && `${mappingsByType.pms_grade.size} grade(s)`,
    mappingsByType.employee.size > 0 && `${mappingsByType.employee.size} individual(s)`,
  ].filter(Boolean);

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">Loading mappings...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Employee Mapping
        </CardTitle>
        <CardDescription>
          Define which employees are enrolled in this program. Employees matching ANY criteria below are included.
        </CardDescription>
        {summary.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {summary.map((s, i) => (
              <Badge key={i} variant="secondary">{s}</Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="department">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="department" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" /> Dept / BU
            </TabsTrigger>
            <TabsTrigger value="designation" className="text-xs">
              <GraduationCap className="h-3 w-3 mr-1" /> Designation
            </TabsTrigger>
            <TabsTrigger value="grade" className="text-xs">
              Grade
            </TabsTrigger>
            <TabsTrigger value="employee" className="text-xs">
              <UserPlus className="h-3 w-3 mr-1" /> Individual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="department" className="space-y-3 mt-3">
            <Label className="text-xs font-medium text-muted-foreground">Departments</Label>
            <ScrollArea className="h-48 border rounded-md p-2">
              {departments.map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={mappingsByType.department.has(d.id)}
                    onCheckedChange={() => toggle('department', d.id)}
                  />
                  <span className="text-sm">{d.name}</span>
                </label>
              ))}
            </ScrollArea>

            <Label className="text-xs font-medium text-muted-foreground">Business Units</Label>
            <ScrollArea className="h-36 border rounded-md p-2">
              {businessUnits.map((bu: any) => (
                <label key={bu.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={mappingsByType.business_unit.has(bu.id)}
                    onCheckedChange={() => toggle('business_unit', bu.id)}
                  />
                  <span className="text-sm">{bu.name}</span>
                </label>
              ))}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="designation" className="mt-3">
            <ScrollArea className="h-60 border rounded-md p-2">
              {designations.map((d: string) => (
                <label key={d} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={mappingsByType.designation.has(d)}
                    onCheckedChange={() => toggle('designation', d)}
                  />
                  <span className="text-sm">{d}</span>
                </label>
              ))}
              {designations.length === 0 && <p className="text-sm text-muted-foreground p-2">No designations found</p>}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="grade" className="mt-3">
            <ScrollArea className="h-60 border rounded-md p-2">
              {grades.map((g: string) => (
                <label key={g} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={mappingsByType.pms_grade.has(g)}
                    onCheckedChange={() => toggle('pms_grade', g)}
                  />
                  <span className="text-sm">{g}</span>
                </label>
              ))}
              {grades.length === 0 && <p className="text-sm text-muted-foreground p-2">No PMS grades found</p>}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="employee" className="space-y-3 mt-3">
            {/* Selected chips */}
            {mappingsByType.employee.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {Array.from(mappingsByType.employee).map((empId) => {
                  const emp = allEmployees.find((e: any) => e.id === empId);
                  return (
                    <Badge key={empId} variant="secondary" className="gap-1">
                      {emp ? `${emp.full_name || 'Unknown'} (${emp.employee_code || ''})` : empId}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => toggle('employee', empId)} />
                    </Badge>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or employee code..."
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <ScrollArea className="h-52 border rounded-md p-2">
              {filteredEmployees.map((emp: any) => (
                <label key={emp.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded cursor-pointer">
                  <Checkbox
                    checked={mappingsByType.employee.has(emp.id)}
                    onCheckedChange={() => toggle('employee', emp.id)}
                  />
                  <span className="text-sm">
                    {emp.full_name || 'Unknown'}
                    {emp.employee_code && <span className="text-muted-foreground ml-1">({emp.employee_code})</span>}
                  </span>
                </label>
              ))}
              {filteredEmployees.length === 0 && <p className="text-sm text-muted-foreground p-2">No employees found</p>}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
