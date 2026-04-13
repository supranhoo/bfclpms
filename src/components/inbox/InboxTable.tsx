import { Fragment, useState } from 'react';
import { Loader2, Inbox } from 'lucide-react';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InboxRowItem } from './InboxRowItem';
import { InlineQuickAction } from './InlineQuickAction';
import { MobileInboxList } from './MobileInboxList';
import { InboxItem, GroupedInboxItems, groupByDate } from '@/lib/inboxUtils';
import { useIsMobile } from '@/hooks/use-mobile';

interface InboxTableProps {
  items: InboxItem[];
  isLoading?: boolean;
  isFetching?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onViewItem: (item: InboxItem) => void;
  onMarkRead?: (item: InboxItem) => void;
  onNavigate?: (path: string) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  enableGrouping?: boolean;
  currentUserId?: string;
  currentRole?: string;
  onInlineRespond?: (itemId: string, notes: string, evidenceUrl?: string) => void;
  onInlineAccept?: (item: InboxItem) => void;
  isInlineSubmitting?: boolean;
  onSnooze?: (notificationId: string, until: Date) => void;
  onUnsnooze?: (notificationId: string) => void;
  isSnoozing?: boolean;
  showSnoozedInfo?: boolean;
}

export function InboxTable({
  items,
  isLoading,
  isFetching,
  hasMore,
  onLoadMore,
  onViewItem,
  onMarkRead,
  onNavigate,
  emptyMessage = 'No items',
  emptyDescription = 'Nothing to show here',
  enableGrouping = true,
  currentUserId,
  currentRole,
  onInlineRespond,
  onInlineAccept,
  isInlineSubmitting,
  onSnooze,
  onUnsnooze,
  isSnoozing,
  showSnoozedInfo,
}: InboxTableProps) {
  const isMobile = useIsMobile();
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(prev => prev === itemId ? null : itemId);
  };

  const handleCollapseExpand = () => {
    setExpandedItemId(null);
  };

  // Use mobile card layout on small screens
  if (isMobile) {
    return (
      <MobileInboxList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        onViewItem={onViewItem}
        onNavigate={onNavigate}
        emptyMessage={emptyMessage}
        emptyDescription={emptyDescription}
        enableGrouping={enableGrouping}
        currentUserId={currentUserId}
        onInlineRespond={onInlineRespond}
        onInlineAccept={onInlineAccept}
        isInlineSubmitting={isInlineSubmitting}
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground font-medium">{emptyMessage}</p>
          <p className="text-sm text-muted-foreground mt-1">{emptyDescription}</p>
        </CardContent>
      </Card>
    );
  }

  const groupedItems: GroupedInboxItems[] = enableGrouping ? groupByDate(items) : [{ label: '', items }];

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-10"></TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-28 hidden md:table-cell">Status</TableHead>
              <TableHead className="w-32 hidden lg:table-cell">From</TableHead>
              <TableHead className="w-28 text-right">Time</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedItems.map((group) => (
              <Fragment key={group.label || 'all'}>
                {/* Group Header */}
                {enableGrouping && group.label && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={7} className="py-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group.label} ({group.items.length})
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {/* Items */}
                {group.items.map((item) => (
                  <Fragment key={item.id}>
                    <InboxRowItem
                      item={item}
                      onView={onViewItem}
                      onMarkRead={onMarkRead}
                      onNavigate={onNavigate}
                      onToggleExpand={currentUserId ? handleToggleExpand : undefined}
                      isExpanded={expandedItemId === item.id}
                      currentUserId={currentUserId}
                      onSnooze={onSnooze}
                      onUnsnooze={onUnsnooze}
                      isSnoozing={isSnoozing}
                      showSnoozedInfo={showSnoozedInfo}
                    />
                    {/* Inline Quick Action Panel */}
                    {expandedItemId === item.id && currentUserId && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="p-0">
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
                            onCollapse={handleCollapseExpand}
                            isSubmitting={isInlineSubmitting}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isFetching}
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
