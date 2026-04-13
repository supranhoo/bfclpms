/**
 * Mobile-optimized Inbox List Component
 * Card-based layout for notifications and queries on mobile devices
 */

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineQuickAction } from './InlineQuickAction';
import { InboxItem, GroupedInboxItems, groupByDate, getQuickAction, getNotificationNavigationPath } from '@/lib/inboxUtils';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Bell, MessageSquare, Inbox, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface MobileInboxListProps {
  items: InboxItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onViewItem: (item: InboxItem) => void;
  onNavigate?: (path: string) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  enableGrouping?: boolean;
  currentUserId?: string;
  currentRole?: string;
  onInlineRespond?: (itemId: string, notes: string, evidenceUrl?: string) => void;
  onInlineAccept?: (item: InboxItem) => void;
  isInlineSubmitting?: boolean;
}

export function MobileInboxList({
  items,
  isLoading,
  isFetching,
  hasMore,
  onLoadMore,
  onViewItem,
  onNavigate,
  emptyMessage = 'No items',
  emptyDescription = 'Nothing to show here',
  enableGrouping = true,
  currentUserId,
  currentRole,
  onInlineRespond,
  onInlineAccept,
  isInlineSubmitting,
}: MobileInboxListProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8">
          <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground font-medium">{emptyMessage}</p>
          <p className="text-sm text-muted-foreground mt-1 text-center">{emptyDescription}</p>
        </div>
      </Card>
    );
  }

  const groupedItems: GroupedInboxItems[] = enableGrouping ? groupByDate(items) : [{ label: '', items }];

  const formatRelativeTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeClass = (status?: 'open' | 'responded' | 'resolved') => {
    switch (status) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'responded':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default:
        return '';
    }
  };

  const handleToggleExpand = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedItemId(prev => prev === itemId ? null : itemId);
  };

  return (
    <div className="space-y-4">
      {groupedItems.map((group) => (
        <div key={group.label || 'all'}>
          {/* Group Header */}
          {enableGrouping && group.label && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
              {group.label} ({group.items.length})
            </p>
          )}

          {/* Items */}
          <div className="space-y-2">
            {group.items.map((item) => {
              const quickAction = currentUserId ? getQuickAction(item, currentUserId) : null;
              const isExpanded = expandedItemId === item.id;

              return (
                <Card
                  key={item.id}
                  className={cn(
                    "overflow-hidden transition-all",
                    !item.isRead && "border-l-2 border-l-primary bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "p-3 cursor-pointer active:scale-[0.98]",
                      "hover:bg-muted/50"
                    )}
                    onClick={() => {
                      if (item.type === 'notification' && onNavigate) {
                        const path = getNotificationNavigationPath(item, currentUserId, currentRole);
                        if (path) {
                          onNavigate(path);
                          return;
                        }
                      }
                      onViewItem(item);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Type Icon */}
                      <div className="shrink-0 mt-0.5">
                        {item.type === 'notification' ? (
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center",
                            !item.isRead ? "bg-primary/10" : "bg-muted"
                          )}>
                            <Bell className={cn(
                              "h-4 w-4",
                              !item.isRead ? "text-primary" : "text-muted-foreground"
                            )} />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.ticketNumber && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0 font-mono">
                              {item.ticketNumber}
                            </Badge>
                          )}
                          <p className={cn(
                            "text-sm line-clamp-2",
                            !item.isRead && "font-medium"
                          )}>
                            {item.title}
                          </p>
                        </div>
                        {item.message && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {item.message}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <p className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(item.createdAt)}
                          </p>
                          {item.fromUser && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                              • {item.fromUser.fullName || item.fromUser.email}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status + Quick Action */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {item.queryStatus && (
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] capitalize",
                              getStatusBadgeClass(item.queryStatus)
                            )}
                          >
                            {item.queryStatus}
                          </Badge>
                        )}
                        {quickAction && (
                          <Button
                            variant={isExpanded ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={(e) => handleToggleExpand(item.id, e)}
                          >
                            {quickAction.label}
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 ml-0.5" />
                            ) : (
                              <ChevronDown className="h-3 w-3 ml-0.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Quick Action Panel */}
                  {isExpanded && currentUserId && (
                    <InlineQuickAction
                      item={item}
                      currentUserId={currentUserId}
                      onSubmitResponse={(id, notes, url) => {
                        onInlineRespond?.(id, notes, url);
                        setExpandedItemId(null);
                      }}
                      onAcceptResponse={(item) => {
                        onInlineAccept?.(item);
                        setExpandedItemId(null);
                      }}
                      onCollapse={() => setExpandedItemId(null)}
                      isSubmitting={isInlineSubmitting}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isFetching}
            className="w-full"
          >
            {isFetching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
