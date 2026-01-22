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

interface IssuesTableProps {
  issues: SystemIssue[];
  onViewIssue: (issue: SystemIssue) => void;
}

export function IssuesTable({ issues, onViewIssue }: IssuesTableProps) {
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
            <TableHead>Type</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead className="text-right">Age</TableHead>
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
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={cn('text-xs', ISSUE_TYPE_COLORS[issue.issueType])}
                >
                  {ISSUE_TYPE_LABELS[issue.issueType]}
                </Badge>
              </TableCell>
              <TableCell className="font-medium max-w-[200px] truncate">
                {issue.subject}
              </TableCell>
              <TableCell>{issue.employeeName}</TableCell>
              <TableCell className="text-muted-foreground">
                {issue.departmentName}
              </TableCell>
              <TableCell>{issue.assignedToName}</TableCell>
              <TableCell>
                <Badge 
                  variant="outline" 
                  className={cn('text-xs', STATUS_COLORS[issue.status])}
                >
                  {issue.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={cn('text-xs', PRIORITY_COLORS[issue.priority])}>
                  {issue.priority}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <span className={cn(
                  'font-medium',
                  issue.ageInDays >= 14 && 'text-destructive',
                  issue.ageInDays >= 7 && issue.ageInDays < 14 && 'text-warning'
                )}>
                  {issue.ageInDays}d
                </span>
              </TableCell>
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
