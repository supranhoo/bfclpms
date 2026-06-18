import { format } from 'date-fns';
import { useQueryHistory, QueryWithDetails } from '@/hooks/useQueryWorkflow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  MessageCircle,
  CheckCircle2,
  Clock,
  User,
  Paperclip,
  ArrowDown,
  History,
} from 'lucide-react';

interface QueryHistoryDialogProps {
  kpiId: string;
  kpiName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QueryHistoryDialog({ kpiId, kpiName, open, onOpenChange }: QueryHistoryDialogProps) {
  const { data: queries, isLoading } = useQueryHistory(open ? kpiId : undefined);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            <Clock className="h-3 w-3 mr-1" /> Open
          </Badge>
        );
      case 'responded':
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <MessageCircle className="h-3 w-3 mr-1" /> Responded
          </Badge>
        );
      case 'resolved':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolved
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatName = (profile: QueryWithDetails['raised_by_profile']) => {
    if (!profile) return 'Unknown';
    const name = profile.full_name || profile.email;
    return profile.employee_code ? `${name} (${profile.employee_code})` : name;
  };

  const renderQueryTimeline = (query: QueryWithDetails, index: number, isLast: boolean) => {
    const events = [];

    // Event 1: Query Raised
    events.push(
      <div key={`${query.id}-raised`} className="relative pl-8 pb-6">
        <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
          <MessageSquare className="h-3 w-3 text-orange-600 dark:text-orange-400" />
        </div>
        {(query.status !== 'open' || !isLast) && (
          <div className="absolute left-3 top-7 w-0.5 h-full bg-border" />
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-sm">Query Raised</span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(query.created_at), 'dd MMM yyyy, hh:mm a')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            From: {formatName(query.raised_by_profile)} → To: {formatName(query.raised_to_profile)}
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{query.reason}</p>
          </div>
          {query.evidence_url && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); void openStorageFile(query.evidence_url!); }}
              className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <Paperclip className="h-3 w-3" />
              View Query Attachment
            </button>
          )}
        </div>
      </div>
    );

    // Event 2: Response Submitted (if responded or resolved)
    if (query.status === 'responded' || query.status === 'resolved') {
      events.push(
        <div key={`${query.id}-responded`} className="relative pl-8 pb-6">
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
            <MessageCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          </div>
          {query.status !== 'responded' && (
            <div className="absolute left-3 top-7 w-0.5 h-full bg-border" />
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium text-sm">Response Submitted</span>
              <span className="text-xs text-muted-foreground">
                {query.updated_at && format(new Date(query.updated_at), 'dd MMM yyyy, hh:mm a')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              From: {formatName(query.raised_to_profile)}
            </div>
            {query.resolution_notes && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm">{query.resolution_notes}</p>
              </div>
            )}
            {query.resolution_evidence_url && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); void openStorageFile(query.resolution_evidence_url!); }}
                className="inline-thread inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <Paperclip className="h-3 w-3" />
                View Response Attachment
              </button>
            )}
          </div>
        </div>
      );
    }

    // Event 3: Query Resolved (if resolved)
    if (query.status === 'resolved') {
      events.push(
        <div key={`${query.id}-resolved`} className="relative pl-8 pb-6">
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium text-sm">Query Resolved</span>
              <span className="text-xs text-muted-foreground">
                {query.resolved_at && format(new Date(query.resolved_at), 'dd MMM yyyy, hh:mm a')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              Accepted by: {formatName(query.raised_by_profile)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={query.id} className="relative">
        {index > 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="w-full h-px bg-border" />
            <Badge variant="secondary" className="mx-2 shrink-0 text-xs font-mono">
              {(query as any).ticket_number || `Query #${index + 1}`}
            </Badge>
            <div className="w-full h-px bg-border" />
          </div>
        )}
        <div className="flex items-center justify-end mb-2">
          {getStatusBadge(query.status)}
        </div>
        {events}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Query History
          </DialogTitle>
          <DialogDescription>
            All queries and responses for: <span className="font-medium">{kpiName}</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          ) : !queries || queries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No queries have been raised for this KPI</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queries.map((query, index) => 
                renderQueryTimeline(query, index, index === queries.length - 1)
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
