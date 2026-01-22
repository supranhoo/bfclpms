import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { IssueType, IssuePriority, IssueStatus, ISSUE_TYPE_LABELS } from '@/hooks/useSystemIssues';

export interface IssueFiltersState {
  issueType: IssueType | 'all';
  status: IssueStatus | 'all';
  priority: IssuePriority | 'all';
  department: string;
  search: string;
}

interface IssueFiltersProps {
  filters: IssueFiltersState;
  onFiltersChange: (filters: IssueFiltersState) => void;
  departments: { id: string; name: string }[];
}

export function IssueFilters({ filters, onFiltersChange, departments }: IssueFiltersProps) {
  const handleChange = (key: keyof IssueFiltersState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      issueType: 'all',
      status: 'all',
      priority: 'all',
      department: 'all',
      search: '',
    });
  };

  const hasActiveFilters = 
    filters.issueType !== 'all' || 
    filters.status !== 'all' || 
    filters.priority !== 'all' || 
    filters.department !== 'all' || 
    filters.search !== '';

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Input
        placeholder="Search by name or description..."
        value={filters.search}
        onChange={(e) => handleChange('search', e.target.value)}
        className="w-64"
      />

      <Select value={filters.issueType} onValueChange={(v) => handleChange('issueType', v)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Issue Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {(Object.entries(ISSUE_TYPE_LABELS) as [IssueType, string][]).map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => handleChange('status', v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="resolved">Resolved</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.priority} onValueChange={(v) => handleChange('priority', v)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priority</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.department} onValueChange={(v) => handleChange('department', v)}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters}>
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
