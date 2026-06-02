import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useSystemIssues, SystemIssue } from '@/hooks/useSystemIssues';
import { IssuesDashboardCards } from '@/components/issues/IssuesDashboardCards';
import { IssueFilters, IssueFiltersState } from '@/components/issues/IssueFilters';
import { IssuesHeatmap } from '@/components/issues/IssuesHeatmap';
import { IssuesTable } from '@/components/issues/IssuesTable';
import { IssueDetailSheet } from '@/components/issues/IssueDetailSheet';
import { IssuesByTypeChart } from '@/components/issues/IssuesByTypeChart';
import { TableSkeleton } from '@/components/ui/LoadingSkeletons';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const ISS_DEFAULT_FIELDS = [
  { field_key: 'issue_type',   default_label: 'Issue Type',   default_sort: 10, is_required: true },
  { field_key: 'subject',      default_label: 'Subject',      default_sort: 20, is_required: true },
  { field_key: 'description',  default_label: 'Description',  default_sort: 30 },
  { field_key: 'employee',     default_label: 'Employee',     default_sort: 40 },
  { field_key: 'department',   default_label: 'Department',   default_sort: 50 },
  { field_key: 'assigned_to',  default_label: 'Assigned To',  default_sort: 60 },
  { field_key: 'status',       default_label: 'Status',       default_sort: 70 },
  { field_key: 'priority',     default_label: 'Priority',     default_sort: 80 },
  { field_key: 'age_days',     default_label: 'Age (Days)',   default_sort: 90 },
  { field_key: 'created_date', default_label: 'Created Date', default_sort: 100 },
] as const;

export default function IssuesReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('issues');
  const { issues, summary, isLoading } = useSystemIssues();
  const [selectedIssue, setSelectedIssue] = useState<SystemIssue | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const resolvedFields = useResolvedReportFields('RPT-ISS-001', ISS_DEFAULT_FIELDS);
  
  const [filters, setFilters] = useState<IssueFiltersState>({
    issueType: 'all',
    status: 'all',
    priority: 'all',
    department: 'all',
    search: '',
  });

  // Extract unique departments for filter dropdown
  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    issues.forEach(issue => {
      if (issue.departmentId && issue.departmentId !== 'unknown') {
        deptMap.set(issue.departmentId, issue.departmentName);
      }
    });
    return Array.from(deptMap.entries()).map(([id, name]) => ({ id, name }));
  }, [issues]);

  // Apply filters
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (filters.issueType !== 'all' && issue.issueType !== filters.issueType) return false;
      if (filters.status !== 'all' && issue.status !== filters.status) return false;
      if (filters.priority !== 'all' && issue.priority !== filters.priority) return false;
      if (filters.department !== 'all' && issue.departmentId !== filters.department) return false;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (
          !issue.subject.toLowerCase().includes(searchLower) &&
          !issue.employeeName.toLowerCase().includes(searchLower) &&
          !issue.description.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [issues, filters]);

  const handleViewIssue = (issue: SystemIssue) => {
    setSelectedIssue(issue);
    setSheetOpen(true);
  };

  const handleDepartmentClick = (departmentId: string) => {
    setFilters(prev => ({ ...prev, department: departmentId }));
  };

  const handleExport = () => {
    if (filteredIssues.length === 0) {
      toast.error('No data to export');
      return;
    }
    const visible = resolvedFields.filter((f) => !f.is_hidden);
    const valueFor = (issue: SystemIssue, key: string): string | number => {
      switch (key) {
        case 'issue_type':   return issue.issueType.replace('_', ' ').toUpperCase();
        case 'subject':      return issue.subject;
        case 'description':  return issue.description;
        case 'employee':     return issue.employeeName;
        case 'department':   return issue.departmentName;
        case 'assigned_to':  return issue.assignedToName;
        case 'status':       return issue.status;
        case 'priority':     return issue.priority;
        case 'age_days':     return issue.ageInDays;
        case 'created_date': return format(issue.createdAt, 'dd MMM yyyy');
        default: return '';
      }
    };
    const exportData = filteredIssues.map((issue) => {
      const row: Record<string, string | number> = {};
      for (const fld of visible) row[fld.label] = valueFor(issue, fld.field_key);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData, { header: visible.map((f) => f.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issues Report');
    XLSX.writeFile(wb, `Issues_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Report exported successfully');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Issues Report" description="Loading..." backTo="/reports" />
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unified Issues Report"
        description="Consolidated view of all system-wide issues requiring attention"
        backTo="/reports"
        actions={
          canExport ? (
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Summary Cards */}
      <IssuesDashboardCards summary={summary} />

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <IssuesByTypeChart summary={summary} />
        <IssuesHeatmap summary={summary} onDepartmentClick={handleDepartmentClick} />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Filter Issues</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredIssues.length} of {issues.length} issues
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <IssueFilters
            filters={filters}
            onFiltersChange={setFilters}
            departments={departments}
          />
        </CardContent>
      </Card>

      {/* Issues Table */}
      <IssuesTable issues={filteredIssues} onViewIssue={handleViewIssue} fields={resolvedFields} />

      {/* Detail Sheet */}
      <IssueDetailSheet
        issue={selectedIssue}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
