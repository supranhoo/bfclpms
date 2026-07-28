import { KpiFilterState, ReviewStatus } from '@/hooks/useKpiFilters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, User, Briefcase, RotateCcw, Filter, CheckCircle2 } from 'lucide-react';
import { CANONICAL_WORKFLOW_STAGES, statusLabels } from '@/lib/reviewConstants';

// ADR-194 §WF-STAGE-SSOT — derive the status chips from the canonical stage
// list so no stage (e.g. Functional Manager Review) can be silently omitted.
const statusChipColors: Record<string, string> = {
  kra_set: 'bg-muted',
  self_review: 'bg-blue-100',
  manager_check: 'bg-yellow-100',
  functional_manager_check: 'bg-fuchsia-100',
  skip_level_check: 'bg-teal-100',
  hr_pms_review: 'bg-rose-100',
  audit: 'bg-purple-100',
  management_review: 'bg-emerald-100',
  approved: 'bg-green-100',
};

const statusOptions: { value: ReviewStatus; label: string; color: string }[] =
  CANONICAL_WORKFLOW_STAGES.map(stage => ({
    value: stage as ReviewStatus,
    label: statusLabels[stage] || stage,
    color: statusChipColors[stage] || 'bg-muted',
  }));

interface KpiFilterBarProps {
  filters: KpiFilterState;
  updateFilter: (key: keyof KpiFilterState, value: string | null) => void;
  resetFilters: () => void;
  divisions: { id: string; name: string }[];
  businessUnits: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  managers: { id: string; full_name: string | null; email: string; employee_code: string | null }[];
  employees: { id: string; full_name: string | null; email: string; employee_code: string | null }[];
  categories?: { id: string; name: string; color: string | null }[];
  showCategoryFilter?: boolean;
  showStatusFilter?: boolean;
  isLoading?: boolean;
}

export function KpiFilterBar({
  filters,
  updateFilter,
  resetFilters,
  divisions,
  businessUnits,
  departments,
  managers,
  employees,
  categories,
  showCategoryFilter = true,
  showStatusFilter = true,
  isLoading,
}: KpiFilterBarProps) {
  const activeFilterCount = [
    filters.divisionId,
    filters.businessUnitId,
    filters.departmentId,
    filters.managerId,
    filters.employeeId,
    filters.categoryId,
    filters.status,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filters</span>
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {activeFilterCount} active
          </Badge>
        )}
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={resetFilters}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>
      
      <div className="flex flex-wrap gap-3">
        {/* Division Filter */}
        <Select 
          value={filters.divisionId || 'all'} 
          onValueChange={(v) => updateFilter('divisionId', v === 'all' ? null : v)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[180px]">
            <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map(div => (
              <SelectItem key={div.id} value={div.id}>
                {div.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Business Unit Filter */}
        <Select 
          value={filters.businessUnitId || 'all'} 
          onValueChange={(v) => updateFilter('businessUnitId', v === 'all' ? null : v)}
          disabled={isLoading || divisions.length === 0}
        >
          <SelectTrigger className="w-[180px]">
            <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Business Unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Business Units</SelectItem>
            {businessUnits.map(bu => (
              <SelectItem key={bu.id} value={bu.id}>
                {bu.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department Filter */}
        <Select 
          value={filters.departmentId || 'all'} 
          onValueChange={(v) => updateFilter('departmentId', v === 'all' ? null : v)}
          disabled={isLoading || departments.length === 0}
        >
          <SelectTrigger className="w-[180px]">
            <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(dept => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Manager Filter */}
        <Select 
          value={filters.managerId || 'all'} 
          onValueChange={(v) => updateFilter('managerId', v === 'all' ? null : v)}
          disabled={isLoading || managers.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <Users className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Reporting Manager" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Managers</SelectItem>
            {managers.map(mgr => (
              <SelectItem key={mgr.id} value={mgr.id}>
                {mgr.full_name || mgr.email}
                {mgr.employee_code && (
                  <span className="text-muted-foreground ml-1">({mgr.employee_code})</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Employee Filter */}
        <Select 
          value={filters.employeeId || 'all'} 
          onValueChange={(v) => updateFilter('employeeId', v === 'all' ? null : v)}
          disabled={isLoading || employees.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <User className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map(emp => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.full_name || emp.email}
                {emp.employee_code && (
                  <span className="text-muted-foreground ml-1">({emp.employee_code})</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        {showStatusFilter && (
          <Select 
            value={filters.status || 'all'} 
            onValueChange={(v) => updateFilter('status', v === 'all' ? null : v)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[160px]">
              <CheckCircle2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Category Filter */}
        {showCategoryFilter && categories && categories.length > 0 && (
          <Select 
            value={filters.categoryId || 'all'} 
            onValueChange={(v) => updateFilter('categoryId', v === 'all' ? null : v)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: cat.color || '#3B82F6' }}
                    />
                    {cat.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
