import { format } from 'date-fns';
import { X, Bell, MessageSquare, User, Calendar, Paperclip, ExternalLink, Clock, CheckCircle2, MessageCircle, Send, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { InboxItem, getNotificationTypeLabel, getQueryStatusClasses, getNotificationNavigationPath, getStatusLabel } from '@/lib/inboxUtils';
import { cn } from '@/lib/utils';

interface InboxDetailSheetProps {
  item: InboxItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (path: string) => void;
  onRespond?: (item: InboxItem) => void;
  onAccept?: (item: InboxItem) => void;
  currentUserId?: string;
  currentRole?: string;
}

export function InboxDetailSheet({
  item,
  open,
  onOpenChange,
  onNavigate,
  onRespond,
  onAccept,
  currentUserId,
  currentRole,
}: InboxDetailSheetProps) {
  if (!item) return null;

  const isQuery = item.type === 'query';
  const isRecipient = item.toUser?.id === currentUserId;
  const isRaiser = item.fromUser?.id === currentUserId;

  const navigationPath = getNotificationNavigationPath(item, currentUserId, currentRole);

  // Explicit fallback for @mention notifications (no IIFE)
  let effectiveNavigationPath: string | null = navigationPath;
  if (!effectiveNavigationPath && item.notificationType === 'observation_mention') {
    const meta = (item.metadata || {}) as Record<string, any>;
    const kpi = item.kpiId || meta.kpi_id;
    const emp = meta.employee_id;
    if (kpi && emp) effectiveNavigationPath = `/dashboard?mentioned_kpi=${kpi}&mentioned_employee=${emp}`;
    else if (kpi) effectiveNavigationPath = `/dashboard?mentioned_kpi=${kpi}`;
    else effectiveNavigationPath = '/dashboard';
  }

  const isMentionNotification = item.notificationType === 'observation_mention';

  const handleNavigate = () => {
    if (effectiveNavigationPath && onNavigate) {
      onNavigate(effectiveNavigationPath);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {isQuery ? (
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Bell className="h-5 w-5 text-muted-foreground" />
              )}
              <Badge variant="outline" className="text-xs">
                {isQuery ? 'Query' : getNotificationTypeLabel(item.notificationType || '')}
              </Badge>
              {isQuery && item.queryStatus && (
                <Badge variant="outline" className={cn('text-xs', getQueryStatusClasses(item.queryStatus))}>
                  {item.queryStatus === 'open' && 'Open'}
                  {item.queryStatus === 'responded' && 'Responded'}
                  {item.queryStatus === 'resolved' && 'Resolved'}
                </Badge>
              )}
            </div>
            {/* Workflow Status Transition for notifications */}
            {!isQuery && item.metadata?.from_status && item.metadata?.to_status && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  {getStatusLabel(item.metadata.from_status)}
                </Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Badge variant="default" className="text-xs">
                  {getStatusLabel(item.metadata.to_status)}
                </Badge>
              </div>
            )}
          </div>
          {item.ticketNumber && (
            <Badge variant="secondary" className="text-xs font-mono w-fit">
              {item.ticketNumber}
            </Badge>
          )}
          <SheetTitle className="text-left">{item.title}</SheetTitle>
          <SheetDescription className="text-left">
            {item.kpiName && (
              <span className="text-foreground font-medium">{item.kpiName}</span>
            )}
            {item.kraName && (
              <span className="text-muted-foreground"> • {item.kraName}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Message Content */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm">{item.message}</p>
          </div>

          {/* Meta Information */}
          <div className="grid grid-cols-2 gap-4">
            {item.fromUser && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{item.fromUser.fullName || item.fromUser.email}</span>
                </div>
              </div>
            )}
            {item.toUser && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{item.toUser.fullName || item.toUser.email}</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{format(new Date(item.createdAt), 'dd MMM yyyy, hh:mm a')}</span>
              </div>
            </div>
          </div>

          {/* Evidence/Attachment */}
          {item.evidenceUrl && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Attachment</Label>
              <a
                href={item.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Paperclip className="h-4 w-4" />
                View Attachment
              </a>
            </div>
          )}

          {/* Resolution Notes (for queries) */}
          {isQuery && item.resolutionNotes && (
            <>
              <Separator />
              <div className={cn(
                'p-4 rounded-lg border-2',
                item.queryStatus === 'resolved'
                  ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700'
                  : 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {item.queryStatus === 'resolved' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  <Label className={cn(
                    'text-sm font-medium',
                    item.queryStatus === 'resolved'
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-amber-700 dark:text-amber-300'
                  )}>
                    {item.queryStatus === 'resolved' ? 'Response Accepted' : 'Response Pending Acceptance'}
                  </Label>
                </div>
                <p className="text-sm">{item.resolutionNotes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Query Actions */}
            {isQuery && item.queryStatus === 'open' && isRecipient && onRespond && (
              <Button onClick={() => onRespond(item)} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Submit Response
              </Button>
            )}
            {isQuery && item.queryStatus === 'responded' && isRaiser && onAccept && (
              <Button onClick={() => onAccept(item)} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept Response
              </Button>
            )}

            {/* Dedicated mention navigation — always visible for observation_mention */}
            {isMentionNotification && (
              <Button onClick={() => {
                const meta = (item.metadata || {}) as Record<string, any>;
                const kpi = item.kpiId || meta.kpi_id;
                const emp = meta.employee_id;
                const path = kpi && emp
                  ? `/dashboard?mentioned_kpi=${kpi}&mentioned_employee=${emp}`
                  : kpi ? `/dashboard?mentioned_kpi=${kpi}` : '/dashboard';
                onNavigate?.(path);
                onOpenChange(false);
              }} className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in App
              </Button>
            )}

            {/* Generic navigation for other notification types */}
            {!isMentionNotification && effectiveNavigationPath && (
              <Button onClick={handleNavigate} className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in App
              </Button>
            )}

            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
