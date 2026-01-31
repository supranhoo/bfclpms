import { useState, useMemo } from 'react';
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

export default function IssuesReport() {
  const { issues, summary, isLoading } = useSystemIssues();
  const [selectedIssue, setSelectedIssue] = useState<SystemIssue | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  
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

    const exportData = filteredIssues.map(issue => ({
      'Issue Type': issue.issueType.replace('_', ' ').toUpperCase(),
      'Subject': issue.subject,
      'Description': issue.description,
      'Employee': issue.employeeName,
      'Department': issue.departmentName,
      'Assigned To': issue.assignedToName,
      'Status': issue.status,
      'Priority': issue.priority,
      'Age (Days)': issue.ageInDays,
      'Created Date': format(issue.createdAt, 'dd MMM yyyy'),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
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
          <Button onClick={handleExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        }
      />

      {/* Summary Cards */}
      <IssuesDashboardCards summary={summary} />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
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
      <IssuesTable issues={filteredIssues} onViewIssue={handleViewIssue} />

      {/* Detail Sheet */}
      <IssueDetailSheet
        issue={selectedIssue}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
