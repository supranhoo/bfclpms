import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import {
  SystemIssue,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPE_COLORS,
  PRIORITY_COLORS,
  STATUS_COLORS,
} from '@/hooks/useSystemIssues';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { ResolvedReportField } from '@/hooks/useResolvedReportFields';

interface IssuesTableProps {
  issues: SystemIssue[];
  onViewIssue: (issue: SystemIssue) => void;
  fields: ResolvedReportField[];
}

export function IssuesTable({ issues, onViewIssue, fields }: IssuesTableProps) {
  const visibleFields = fields.filter((f) => !f.is_hidden);

  const renderCell = (issue: SystemIssue, key: string) => {
    switch (key) {
      case 'issue_type':
        return (
          <Badge
            variant="outline"
            className={cn('text-xs', ISSUE_TYPE_COLORS[issue.issueType])}
          >
            {ISSUE_TYPE_LABELS[issue.issueType]}
          </Badge>
        );
      case 'subject':
        return <span className="font-medium">{issue.subject}</span>;
      case 'description':
        return (
          <span className="text-muted-foreground line-clamp-2">
            {issue.description}
          </span>
        );
      case 'employee':
        return issue.employeeName;
      case 'department':
        return <span className="text-muted-foreground">{issue.departmentName}</span>;
      case 'assigned_to':
        return issue.assignedToName;
      case 'status':
        return (
          <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[issue.status])}>
            {issue.status.replace('_', ' ')}
          </Badge>
        );
      case 'priority':
        return (
          <Badge className={cn('text-xs', PRIORITY_COLORS[issue.priority])}>
            {issue.priority}
          </Badge>
        );
      case 'age_days':
        return (
          <span
            className={cn(
              'font-medium',
              issue.ageInDays >= 14 && 'text-destructive',
              issue.ageInDays >= 7 && issue.ageInDays < 14 && 'text-warning',
            )}
          >
            {issue.ageInDays}d
          </span>
        );
      case 'created_date':
        return format(issue.createdAt, 'dd MMM yyyy');
      default:
        return null;
    }
  };

  const cellClassFor = (key: string) => {
    if (key === 'subject') return 'max-w-[200px] truncate';
    if (key === 'description') return 'max-w-[260px]';
    if (key === 'age_days') return 'text-right';
    return undefined;
  };

  const headClassFor = (key: string) => (key === 'age_days' ? 'text-right' : undefined);

  if (issues.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No issues found matching the current filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleFields.map((f) => (
              <TableHead key={f.field_key} className={headClassFor(f.field_key)}>
                {f.label}
              </TableHead>
            ))}
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow 
              key={issue.id}
              className={cn(
                issue.priority === 'critical' && 'bg-destructive/5',
                issue.status === 'overdue' && 'bg-warning/5'
              )}
            >
              {visibleFields.map((f) => (
                <TableCell key={f.field_key} className={cellClassFor(f.field_key)}>
                  {renderCell(issue, f.field_key)}
                </TableCell>
              ))}
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onViewIssue(issue)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
