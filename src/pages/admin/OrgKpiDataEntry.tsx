import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKraCategories, useDepartments, useProfiles } from '@/hooks/useOrganization';
import { useOrgKpiValues, useBulkUpsertOrgKpiValues, OrgKpiValue } from '@/hooks/useOrgKpiValues';
import { useOrgLevelKpis } from '@/hooks/useOrgLevelKpis';
import { useOrgKpiOwnershipMap } from '@/hooks/useOrgKpiDataOwner';
import { useBulkPropagateOrgKpiValues } from '@/hooks/usePropagateOrgKpiValue';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { OrgLevelScope } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { OrgKpiOwnerDialog } from '@/components/admin/OrgKpiOwnerDialog';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { Building2, Save, AlertTriangle, Filter, Users, User, Search, X } from 'lucide-react';

interface EditableKpi {
  category_id: string;
  kra_name: string;
  kpi_name: string;
  target_value: number | null;
  uom: string | null;
  achieved_value: number | null;
  data_source: string;
  remarks: string;
  evidence_url: string | null;
  isModified: boolean;
  // Threshold fields for uniform scoring mode
  r5: string;
  r4: string;
  r3: string;
  r2: string;
  r1: string;
  r0: string;
  criteria: string;
  // Scoped values
  department_id: string | null;
  employee_id: string | null;
}

export default function OrgKpiDataEntry() {
  const { profile, role } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [editedValues, setEditedValues] = useState<Map<string, EditableKpi>>(new Map());
  
  // New filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedDesignation, setSelectedDesignation] = useState<string | null>(null);
  const [selectedKraName, setSelectedKraName] = useState<string | null>(null);
  
  // Owner dialog state
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [selectedKpiForOwner, setSelectedKpiForOwner] = useState<{ categoryId: string; kraName: string; kpiName: string } | null>(null);

  // Fetch org-level KPIs (where is_org_level = true at KPI level)
  const { data: orgLevelKpis, isLoading: kpisLoading } = useOrgLevelKpis(selectedPeriod, selectedYear);
  const { data: categories } = useKraCategories();
  const { data: departments } = useDepartments();
  const { data: allProfiles } = useProfiles();
  const { data: existingOrgValues } = useOrgKpiValues(
    selectedCategoryId !== 'all' ? selectedCategoryId : undefined, 
    selectedPeriod, 
    selectedYear
  );
  const bulkUpsert = useBulkUpsertOrgKpiValues();
  const propagate = useBulkPropagateOrgKpiValues();
  const { ownershipMap, isAdmin } = useOrgKpiOwnershipMap();
  const { departments: deptList, designations } = useEmployeeFilterOptions();

  // Get unique categories from org-level KPIs
  const orgLevelCategories = useMemo(() => {
    if (!orgLevelKpis || !categories) return [];
    const categoryIds = new Set(orgLevelKpis.map(k => k.category_id));
    return categories.filter(c => categoryIds.has(c.id));
  }, [orgLevelKpis, categories]);

  // Get unique KRA names for filter
  const kraNameOptions = useMemo(() => {
    if (!orgLevelKpis) return [];
    const names = new Set(orgLevelKpis.map(k => k.kra_name));
    return Array.from(names).sort();
  }, [orgLevelKpis]);

  // Filter KPIs by selected category
  const filteredKpis = useMemo(() => {
    if (!orgLevelKpis) return [];
    if (selectedCategoryId === 'all') return orgLevelKpis;
    return orgLevelKpis.filter(k => k.category_id === selectedCategoryId);
  }, [orgLevelKpis, selectedCategoryId]);

  // Create a map of existing org values for quick lookup
  // Key format: categoryId||kraName||kpiName||departmentId||employeeId
  const existingValuesMap = useMemo(() => {
    const map = new Map<string, OrgKpiValue>();
    existingOrgValues?.forEach(v => {
      const deptPart = v.department_id || 'null';
      const empPart = v.employee_id || 'null';
      const key = `${v.category_id}||${v.kra_name}||${v.kpi_name}||${deptPart}||${empPart}`;
      map.set(key, v);
    });
    return map;
  }, [existingOrgValues]);

  // Check if any category uses uniform scoring
  const getCategoryScoringMode = (categoryId: string) => {
    return categories?.find(c => c.id === categoryId)?.org_scoring_mode || 'individual';
  };

  // Build the key for a given KPI row
  const buildKey = (categoryId: string, kraName: string, kpiName: string, departmentId: string | null, employeeId: string | null) => {
    const deptPart = departmentId || 'null';
    const empPart = employeeId || 'null';
    return `${categoryId}||${kraName}||${kpiName}||${deptPart}||${empPart}`;
  };

  const getDisplayValue = (categoryId: string, kraName: string, kpiName: string, departmentId: string | null = null, employeeId: string | null = null) => {
    const key = buildKey(categoryId, kraName, kpiName, departmentId, employeeId);
    const edited = editedValues.get(key);
    const existing = existingValuesMap.get(key);
    
    if (edited) {
      return {
        achieved_value: edited.achieved_value,
        data_source: edited.data_source,
        target_value: edited.target_value,
        remarks: edited.remarks,
        evidence_url: edited.evidence_url,
        r5: edited.r5,
        r4: edited.r4,
        r3: edited.r3,
        r2: edited.r2,
        r1: edited.r1,
        r0: edited.r0,
        criteria: edited.criteria,
      };
    }
    
    return {
      achieved_value: existing?.achieved_value ?? null,
      data_source: existing?.data_source ?? '',
      target_value: existing?.target_value ?? null,
      remarks: existing?.remarks ?? '',
      evidence_url: existing?.evidence_url ?? null,
      r5: existing?.r5 ?? '',
      r4: existing?.r4 ?? '',
      r3: existing?.r3 ?? '',
      r2: existing?.r2 ?? '',
      r1: existing?.r1 ?? '',
      r0: existing?.r0 ?? '',
      criteria: existing?.criteria ?? 'Higher is Better',
    };
  };

  const handleValueChange = (
    categoryId: string, 
    kraName: string, 
    kpiName: string, 
    field: keyof EditableKpi, 
    value: string | null, 
    kpi: typeof filteredKpis[0],
    departmentId: string | null = null,
    employeeId: string | null = null
  ) => {
    const key = buildKey(categoryId, kraName, kpiName, departmentId, employeeId);
    const existing = existingValuesMap.get(key);
    
    const current = editedValues.get(key) || {
      category_id: categoryId,
      kra_name: kraName,
      kpi_name: kpiName,
      target_value: existing?.target_value ?? kpi?.target_value ?? null,
      uom: kpi?.uom ?? null,
      achieved_value: existing?.achieved_value ?? null,
      data_source: existing?.data_source ?? '',
      remarks: existing?.remarks ?? '',
      evidence_url: existing?.evidence_url ?? null,
      isModified: false,
      r5: existing?.r5 ?? '',
      r4: existing?.r4 ?? '',
      r3: existing?.r3 ?? '',
      r2: existing?.r2 ?? '',
      r1: existing?.r1 ?? '',
      r0: existing?.r0 ?? '',
      criteria: existing?.criteria ?? 'Higher is Better',
      department_id: departmentId,
      employee_id: employeeId,
    };

    let parsedValue: string | number | null = value;
    if (field === 'achieved_value' || field === 'target_value') {
      parsedValue = value === '' || value === null ? null : parseFloat(value);
    }

    const updated = {
      ...current,
      [field]: parsedValue,
      isModified: true,
    };

    setEditedValues(new Map(editedValues.set(key, updated)));
  };

  // Build display rows: for each KPI, expand based on scope
  const displayRows = useMemo(() => {
    const rows: Array<{
      kpi: typeof filteredKpis[0];
      departmentId: string | null;
      departmentName: string | null;
      employeeId: string | null;
      employeeName: string | null;
      employeeCode: string | null;
      designation: string | null;
      scope: OrgLevelScope;
    }> = [];

    filteredKpis.forEach(kpi => {
      const scope = (kpi as any).org_level_scope as OrgLevelScope || 'organization';
      
      if (scope === 'organization') {
        rows.push({
          kpi,
          departmentId: null,
          departmentName: null,
          employeeId: null,
          employeeName: 'All Employees',
          employeeCode: null,
          designation: null,
          scope,
        });
      } else if (scope === 'department') {
        // Create a row for each department
        departments?.forEach(dept => {
          rows.push({
            kpi,
            departmentId: dept.id,
            departmentName: dept.name,
            employeeId: null,
            employeeName: `All in ${dept.name}`,
            employeeCode: null,
            designation: null,
            scope,
          });
        });
      } else if (scope === 'employee') {
        // Create a row for each employee with full profile data
        allProfiles?.forEach(emp => {
          const empDept = departments?.find(d => d.id === emp.department_id);
          rows.push({
            kpi,
            departmentId: emp.department_id || null,
            departmentName: empDept?.name || null,
            employeeId: emp.id,
            employeeName: emp.full_name || emp.email,
            employeeCode: emp.employee_code || null,
            designation: emp.designation || null,
            scope,
          });
        });
      }
    });

    return rows;
  }, [filteredKpis, departments, allProfiles]);

  // Apply filters to display rows
  const filteredDisplayRows = useMemo(() => {
    return displayRows.filter(row => {
      // Search filter - match employee name, code, or KPI name
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const empName = row.employeeName?.toLowerCase() || '';
        const empCode = row.employeeCode?.toLowerCase() || '';
        const kpiName = row.kpi.kpi_name.toLowerCase();
        const kraName = row.kpi.kra_name.toLowerCase();
        if (!empName.includes(query) && !empCode.includes(query) && 
            !kpiName.includes(query) && !kraName.includes(query)) {
          return false;
        }
      }
      
      // Department filter
      if (selectedDepartmentId && row.departmentId !== selectedDepartmentId) {
        return false;
      }
      
      // Designation filter
      if (selectedDesignation && row.designation !== selectedDesignation) {
        return false;
      }
      
      // KRA filter
      if (selectedKraName && row.kpi.kra_name !== selectedKraName) {
        return false;
      }
      
      return true;
    });
  }, [displayRows, searchQuery, selectedDepartmentId, selectedDesignation, selectedKraName]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDepartmentId(null);
    setSelectedDesignation(null);
    setSelectedKraName(null);
  };

  const hasActiveFilters = searchQuery || selectedDepartmentId || selectedDesignation || selectedKraName;

  const handleSaveAll = async () => {
    const valuesToSave = Array.from(editedValues.values())
      .filter(v => v.isModified)
      .map(v => {
        const scoringMode = getCategoryScoringMode(v.category_id);
        const isUniform = scoringMode === 'uniform';
        
        return {
          category_id: v.category_id,
          kra_name: v.kra_name,
          kpi_name: v.kpi_name,
          review_period: selectedPeriod,
          review_year: selectedYear,
          achieved_value: v.achieved_value,
          data_source: v.data_source || undefined,
          remarks: v.remarks || undefined,
          evidence_url: v.evidence_url,
          entered_by: profile?.id,
          department_id: v.department_id || undefined,
          employee_id: v.employee_id || undefined,
          // Include threshold fields for uniform scoring
          ...(isUniform && {
            target_value: v.target_value,
            r5: v.r5 || undefined,
            r4: v.r4 || undefined,
            r3: v.r3 || undefined,
            r2: v.r2 || undefined,
            r1: v.r1 || undefined,
            r0: v.r0 || undefined,
            criteria: v.criteria || 'Higher is Better',
          }),
        };
      });

    if (valuesToSave.length === 0) return;

    await bulkUpsert.mutateAsync(valuesToSave);
    setEditedValues(new Map());
  };

  const modifiedCount = Array.from(editedValues.values()).filter(v => v.isModified).length;

  // Count KPIs by scope
  const scopeCounts = useMemo(() => {
    const counts = { organization: 0, department: 0, employee: 0 };
    filteredKpis.forEach(kpi => {
      const scope = (kpi as any).org_level_scope as OrgLevelScope || 'organization';
      counts[scope]++;
    });
    return counts;
  }, [filteredKpis]);

  if (kpisLoading) {
    return <TableSkeleton rows={5} columns={5} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Organization KPI Data Entry</h1>
        <p className="text-muted-foreground">
          Enter verified organizational data for KPIs marked as organization-level
        </p>
      </div>

      {/* No org-level KPIs warning */}
      {(!orgLevelKpis || orgLevelKpis.length === 0) && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">No Organization-Level KPIs Found</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  To use this feature, mark individual KPIs as "Organization-Level" in the Admin KPI Editor or when assigning KRAs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Period, Year, Search */}
          <div className="flex flex-wrap items-end gap-4">
            <ReviewPeriodSelector
              selectedPeriod={selectedPeriod}
              selectedYear={selectedYear}
              onPeriodChange={setSelectedPeriod}
              onYearChange={setSelectedYear}
            />
            <div className="flex-1 min-w-[250px] space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee name, code, or KPI..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          
          {/* Row 2: Category, Department, Designation, KRA, Clear */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {orgLevelCategories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: cat.color || '#6B7280' }} 
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Department</Label>
              <Select 
                value={selectedDepartmentId || 'all'} 
                onValueChange={(v) => setSelectedDepartmentId(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {deptList?.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Designation</Label>
              <Select 
                value={selectedDesignation || 'all'} 
                onValueChange={(v) => setSelectedDesignation(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Designations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Designations</SelectItem>
                  {designations?.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>KRA</Label>
              <Select 
                value={selectedKraName || 'all'} 
                onValueChange={(v) => setSelectedKraName(v === 'all' ? null : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All KRAs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All KRAs</SelectItem>
                  {kraNameOptions.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
          
          {/* Active filter badges */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2">
              {searchQuery && (
                <Badge variant="secondary" className="gap-1">
                  Search: "{searchQuery}"
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchQuery('')} />
                </Badge>
              )}
              {selectedDepartmentId && (
                <Badge variant="secondary" className="gap-1">
                  {deptList?.find(d => d.id === selectedDepartmentId)?.name}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedDepartmentId(null)} />
                </Badge>
              )}
              {selectedDesignation && (
                <Badge variant="secondary" className="gap-1">
                  {selectedDesignation}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedDesignation(null)} />
                </Badge>
              )}
              {selectedKraName && (
                <Badge variant="secondary" className="gap-1">
                  {selectedKraName}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedKraName(null)} />
                </Badge>
              )}
            </div>
          )}
          
          {/* Scope summary badges */}
          {filteredKpis.length > 0 && (
            <div className="flex gap-2 pt-2 border-t">
              {scopeCounts.organization > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Building2 className="h-3 w-3" />
                  {scopeCounts.organization} Org-wide
                </Badge>
              )}
              {scopeCounts.department > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Users className="h-3 w-3" />
                  {scopeCounts.department} Department-scoped
                </Badge>
              )}
              {scopeCounts.employee > 0 && (
                <Badge variant="outline" className="gap-1">
                  <User className="h-3 w-3" />
                  {scopeCounts.employee} Employee-scoped
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Entry Table */}
      {orgLevelKpis && orgLevelKpis.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organization-Level KPIs - Data Entry
              </CardTitle>
              <CardDescription>
                {filteredDisplayRows.length} rows ({filteredKpis.length} unique KPIs) for {selectedPeriod} {selectedYear}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {modifiedCount > 0 && (
                <Badge variant="secondary">
                  {modifiedCount} unsaved changes
                </Badge>
              )}
              <Button 
                onClick={handleSaveAll} 
                disabled={modifiedCount === 0 || bulkUpsert.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {bulkUpsert.isPending ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {kpisLoading ? (
              <TableSkeleton rows={5} columns={9} />
            ) : filteredDisplayRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No org-level KPIs found for the selected filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Category</TableHead>
                      <TableHead className="font-semibold">KRA</TableHead>
                      <TableHead className="font-semibold">KPI</TableHead>
                      <TableHead className="font-semibold">Employee Name (Code)</TableHead>
                      <TableHead className="font-semibold">Department</TableHead>
                      <TableHead className="font-semibold">Designation</TableHead>
                      <TableHead className="font-semibold text-center w-32">Achieved Value</TableHead>
                      <TableHead className="font-semibold w-48">Remark</TableHead>
                      <TableHead className="font-semibold w-28">Supporting File</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDisplayRows.map((row, idx) => {
                      const { kpi, departmentId, departmentName, employeeId, employeeName, employeeCode, designation, scope } = row;
                      const display = getDisplayValue(kpi.category_id, kpi.kra_name, kpi.kpi_name, departmentId, employeeId);
                      const key = buildKey(kpi.category_id, kpi.kra_name, kpi.kpi_name, departmentId, employeeId);
                      const isModified = editedValues.get(key)?.isModified;
                      
                      // Format employee display: "Name (Code)" or just "Name"
                      const employeeDisplay = employeeCode 
                        ? `${employeeName} (${employeeCode})`
                        : employeeName;
                      
                      return (
                        <TableRow 
                          key={key} 
                          className={`${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} ${isModified ? 'ring-1 ring-primary/30' : ''}`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: kpi.kra_categories?.color || '#6B7280' }} 
                              />
                              <span className="text-sm">{kpi.kra_categories?.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{kpi.kra_name}</TableCell>
                          <TableCell>{kpi.kpi_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {scope === 'organization' ? (
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : scope === 'department' ? (
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className="text-sm">{employeeDisplay}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {departmentName || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {designation || '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={display.achieved_value ?? ''}
                              onChange={(e) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'achieved_value', e.target.value, kpi, departmentId, employeeId)}
                              placeholder="Enter value"
                              className="h-8 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={display.remarks || ''}
                              onChange={(e) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'remarks', e.target.value, kpi, departmentId, employeeId)}
                              placeholder="Enter remark"
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <OrgKpiFileUpload
                              existingUrl={display.evidence_url}
                              onUploadComplete={(url) => handleValueChange(kpi.category_id, kpi.kra_name, kpi.kpi_name, 'evidence_url', url, kpi, departmentId, employeeId)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Owner Assignment Dialog */}
      {selectedKpiForOwner && (
        <OrgKpiOwnerDialog
          open={ownerDialogOpen}
          onOpenChange={setOwnerDialogOpen}
          categoryId={selectedKpiForOwner.categoryId}
          kraName={selectedKpiForOwner.kraName}
          kpiName={selectedKpiForOwner.kpiName}
        />
      )}
    </div>
  );
}
