import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { 
  SystemIssue, 
  ISSUE_TYPE_LABELS, 
  ISSUE_TYPE_COLORS, 
  PRIORITY_COLORS, 
  STATUS_COLORS 
} from '@/hooks/useSystemIssues';
import { 
  Calendar, 
  User, 
  Building2, 
  Clock, 
  ExternalLink,
  AlertTriangle,
  MessageSquare,
  GraduationCap,
  UserX,
  Target,
  FileCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface IssueDetailSheetProps {
  issue: SystemIssue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ISSUE_ICONS = {
  query: MessageSquare,
  training_need: GraduationCap,
  pip: UserX,
  pip_milestone: Target,
  stalled_kpi: Clock,
  pending_kra: FileCheck,
};

export function IssueDetailSheet({ issue, open, onOpenChange }: IssueDetailSheetProps) {
  const navigate = useNavigate();

  if (!issue) return null;

  const IssueIcon = ISSUE_ICONS[issue.issueType];

  const handleNavigateToSource = () => {
    switch (issue.issueType) {
      case 'query':
        navigate(`/queries?kpi=${issue.relatedEntityId}`);
        break;
      case 'training_need':
        navigate('/reports/tni');
        break;
      case 'pip':
      case 'pip_milestone':
        navigate('/admin/pip');
        break;
      case 'stalled_kpi':
      case 'pending_kra':
        navigate(`/admin/kpis?search=${encodeURIComponent(issue.subject)}`);
        break;
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${ISSUE_TYPE_COLORS[issue.issueType]}`}>
              <IssueIcon className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-left">{issue.subject}</SheetTitle>
              <SheetDescription className="text-left">
                {ISSUE_TYPE_LABELS[issue.issueType]}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status & Priority */}
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[issue.status]} variant="outline">
              {issue.status.replace('_', ' ').toUpperCase()}
            </Badge>
            <Badge className={PRIORITY_COLORS[issue.priority]}>
              {issue.priority.toUpperCase()}
            </Badge>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-sm font-medium mb-2">Description</h4>
            <p className="text-sm text-muted-foreground">{issue.description}</p>
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Employee</p>
                <p className="text-sm font-medium">{issue.employeeName}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="text-sm font-medium">{issue.departmentName}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Assigned To</p>
                <p className="text-sm font-medium">{issue.assignedToName}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">
                  {issue.createdAt.toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Age indicator */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Age: {issue.ageInDays} days</p>
              {issue.status === 'overdue' && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  This issue is overdue and requires immediate attention
                </p>
              )}
            </div>
          </div>

          {/* Metadata if available */}
          {issue.metadata && Object.keys(issue.metadata).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Additional Info</h4>
                <div className="space-y-1">
                  {Object.entries(issue.metadata).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">
                        {key.replace('_', ' ')}
                      </span>
                      <span className="font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Action Button */}
          <div className="pt-4">
            <Button onClick={handleNavigateToSource} className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              View in Source
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
