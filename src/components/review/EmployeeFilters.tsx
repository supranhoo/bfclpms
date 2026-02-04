import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter } from 'lucide-react';

interface StatusOption {
  value: string;
  label: string;
}

interface EmployeeFiltersProps {
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // Department filter
  selectedDepartment: string | null;
  onDepartmentChange: (deptId: string | null) => void;
  departments: { id: string; name: string }[];

  // Designation filter
  selectedDesignation: string | null;
  onDesignationChange: (designation: string | null) => void;
  designations: string[];

  // PMS Grade filter
  selectedGrade: string | null;
  onGradeChange: (grade: string | null) => void;
  grades: string[];

  // Manager filter (optional)
  selectedManager?: string | null;
  onManagerChange?: (managerId: string | null) => void;
  managers?: { id: string; name: string }[];
  showManagerFilter?: boolean;

  // Status filter
  statusFilter: string;
  onStatusChange: (status: string) => void;
  statusOptions: StatusOption[];
}

export function EmployeeFilters({
  searchQuery,
  onSearchChange,
  selectedDepartment,
  onDepartmentChange,
  departments,
  selectedDesignation,
  onDesignationChange,
  designations,
  selectedGrade,
  onGradeChange,
  grades,
  selectedManager,
  onManagerChange,
  managers = [],
  showManagerFilter = true,
  statusFilter,
  onStatusChange,
  statusOptions,
}: EmployeeFiltersProps) {
  const activeFiltersCount = [
    selectedDepartment,
    selectedDesignation,
    selectedGrade,
    selectedManager,
    statusFilter !== 'all' ? statusFilter : null,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    onSearchChange('');
    onDepartmentChange(null);
    onDesignationChange(null);
    onGradeChange(null);
    onManagerChange?.(null);
    onStatusChange('all');
  };

  const getSelectedDepartmentName = () => {
    return departments.find(d => d.id === selectedDepartment)?.name || '';
  };

  const getSelectedManagerName = () => {
    return managers.find(m => m.id === selectedManager)?.name || '';
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Department */}
        <Select
          value={selectedDepartment || 'all'}
          onValueChange={(v) => onDepartmentChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Designation */}
        <Select
          value={selectedDesignation || 'all'}
          onValueChange={(v) => onDesignationChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Designation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Designations</SelectItem>
            {designations.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* PMS Grade */}
        <Select
          value={selectedGrade || 'all'}
          onValueChange={(v) => onGradeChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Manager (optional) */}
        {showManagerFilter && onManagerChange && (
          <Select
            value={selectedManager || 'all'}
            onValueChange={(v) => onManagerChange(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Managers</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Status */}
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear All */}
        {(activeFiltersCount > 0 || searchQuery) && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-10">
            <X className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {(selectedDepartment || selectedDesignation || selectedGrade || selectedManager) && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {selectedDepartment && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => onDepartmentChange(null)}
            >
              {getSelectedDepartmentName()}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {selectedDesignation && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => onDesignationChange(null)}
            >
              {selectedDesignation}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {selectedGrade && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => onGradeChange(null)}
            >
              {selectedGrade}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {selectedManager && onManagerChange && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => onManagerChange(null)}
            >
              {getSelectedManagerName()}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
