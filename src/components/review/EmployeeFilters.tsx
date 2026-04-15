import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter } from 'lucide-react';
import { OrgFilterCombobox, ComboboxOption } from '@/components/admin/OrgFilterCombobox';
import { useMemo } from 'react';

interface StatusOption {
  value: string;
  label: string;
}

interface EmployeeFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedDepartment: string | null;
  onDepartmentChange: (deptId: string | null) => void;
  departments: { id: string; name: string }[];
  selectedDesignation: string | null;
  onDesignationChange: (designation: string | null) => void;
  designations: string[];
  selectedGrade: string | null;
  onGradeChange: (grade: string | null) => void;
  grades: string[];
  selectedManager?: string | null;
  onManagerChange?: (managerId: string | null) => void;
  managers?: { id: string; name: string }[];
  showManagerFilter?: boolean;
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

  // Memoized option arrays
  const deptOptions = useMemo<ComboboxOption[]>(
    () => departments.map(d => ({ value: d.id, label: d.name })),
    [departments]
  );
  const desigOptions = useMemo<ComboboxOption[]>(
    () => designations.map(d => ({ value: d, label: d })),
    [designations]
  );
  const gradeOptions = useMemo<ComboboxOption[]>(
    () => grades.map(g => ({ value: g, label: g })),
    [grades]
  );
  const managerOptions = useMemo<ComboboxOption[]>(
    () => managers.map(m => ({ value: m.id, label: m.name })),
    [managers]
  );
  const statusOpts = useMemo<ComboboxOption[]>(
    () => statusOptions.map(s => ({ value: s.value, label: s.label })),
    [statusOptions]
  );

  const toNull = (v: string) => v || null;

  const getSelectedDepartmentName = () =>
    departments.find(d => d.id === selectedDepartment)?.name || '';

  const getSelectedManagerName = () =>
    managers.find(m => m.id === selectedManager)?.name || '';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Searchable Combobox Dropdowns */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <div className="w-full sm:w-[160px]">
            <OrgFilterCombobox
              value={selectedDepartment || ''}
              onValueChange={(v) => onDepartmentChange(toNull(v))}
              options={deptOptions}
              placeholder="Department"
            />
          </div>

          <div className="w-full sm:w-[160px]">
            <OrgFilterCombobox
              value={selectedDesignation || ''}
              onValueChange={(v) => onDesignationChange(toNull(v))}
              options={desigOptions}
              placeholder="Designation"
            />
          </div>

          <div className="w-full sm:w-[140px]">
            <OrgFilterCombobox
              value={selectedGrade || ''}
              onValueChange={(v) => onGradeChange(toNull(v))}
              options={gradeOptions}
              placeholder="Grade"
            />
          </div>

          {showManagerFilter && onManagerChange && (
            <div className="w-full sm:w-[160px]">
              <OrgFilterCombobox
                value={selectedManager || ''}
                onValueChange={(v) => onManagerChange(toNull(v))}
                options={managerOptions}
                placeholder="Manager"
              />
            </div>
          )}

          <div className="w-full sm:w-[160px]">
            <OrgFilterCombobox
              value={statusFilter || 'all'}
              onValueChange={(v) => onStatusChange(v || 'all')}
              options={statusOpts}
              placeholder="Status"
            />
          </div>
        </div>

        {/* Clear All */}
        {(activeFiltersCount > 0 || searchQuery) && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-10 self-start sm:self-auto">
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
