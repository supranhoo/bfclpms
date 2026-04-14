import { useState, useEffect, useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Search, X, Filter, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { hasAdvancedSyntax } from '@/lib/inboxSearchParser';

export interface InboxFiltersState {
  search: string;
  readStatus: 'all' | 'unread' | 'read';
  dateRange: 'today' | 'week' | 'month' | 'all';
  queryStatus: 'all' | 'open' | 'responded' | 'resolved';
  slaStatus: 'all' | 'on-time' | 'at-risk' | 'overdue';
  notificationType: 'all' | string;
}

export const DEFAULT_FILTERS: InboxFiltersState = {
  search: '',
  readStatus: 'all',
  dateRange: 'all',
  queryStatus: 'all',
  slaStatus: 'all',
  notificationType: 'all',
};

interface InboxFiltersProps {
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
  totalCount?: number;
  showingCount?: number;
  /** Which tab is active — controls which dropdowns to show */
  activeTab?: 'notifications' | 'read' | 'received' | 'sent' | 'team' | 'insights';
}

const NOTIFICATION_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'kpi_submitted', label: 'KPI Submitted' },
  { value: 'kpi_approved', label: 'KPI Approved' },
  { value: 'kpi_finalized', label: 'KPI Finalized' },
  { value: 'kpi_ready_for_audit', label: 'Ready for Audit' },
  { value: 'kpi_ready_for_management', label: 'Ready for Management' },
  { value: 'query_raised', label: 'Query Raised' },
  { value: 'query_resolved', label: 'Query Resolved' },
  { value: 'query_responded', label: 'Query Responded' },
  { value: 'observation_mention', label: '@Mentioned' },
];

export function InboxFilters({ filters, onFiltersChange, totalCount, showingCount, activeTab = 'notifications' }: InboxFiltersProps) {
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ ...filters, search: searchValue });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue, filters, onFiltersChange]);

  const handleClearFilters = () => {
    setSearchValue('');
    onFiltersChange({ ...DEFAULT_FILTERS });
  };

  const isQueryTab = activeTab === 'received' || activeTab === 'sent' || activeTab === 'team';
  const isNotificationTab = activeTab === 'notifications' || activeTab === 'read';
  const showAdvancedHint = useMemo(() => hasAdvancedSyntax(searchValue), [searchValue]);

  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.readStatus !== 'all' ? 1 : 0,
    filters.dateRange !== 'all' ? 1 : 0,
    filters.queryStatus !== 'all' ? 1 : 0,
    filters.slaStatus !== 'all' ? 1 : 0,
    filters.notificationType !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const hasActiveFilters = activeFilterCount > 0;

  const filterDropdowns = (
    <>
      {/* Row 1: Status/Query filters + Date */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status Filter (Read/Unread) — notifications only, hidden when tab already implies status */}
        {isNotificationTab && activeTab !== 'notifications' && activeTab !== 'read' && (

        {/* Query Status — query tabs only */}
        {isQueryTab && (
          <Select
            value={filters.queryStatus}
            onValueChange={(value) => onFiltersChange({ ...filters, queryStatus: value as InboxFiltersState['queryStatus'] })}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Query Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="responded">Responded</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Date Range Filter */}
        <Select
          value={filters.dateRange}
          onValueChange={(value) => onFiltersChange({ ...filters, dateRange: value as InboxFiltersState['dateRange'] })}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="outline" size="icon" onClick={handleClearFilters} title="Clear filters">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Row 2: Additional filters (SLA, notification type) */}
      <div className="flex flex-wrap gap-3">
        {/* SLA Status — query tabs only */}
        {isQueryTab && (
          <Select
            value={filters.slaStatus}
            onValueChange={(value) => onFiltersChange({ ...filters, slaStatus: value as InboxFiltersState['slaStatus'] })}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="SLA Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SLA</SelectItem>
              <SelectItem value="on-time">✅ On-time</SelectItem>
              <SelectItem value="at-risk">⚠️ At-risk</SelectItem>
              <SelectItem value="overdue">🔴 Overdue</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Notification Type — notifications tab only */}
        {isNotificationTab && (
          <Select
            value={filters.notificationType}
            onValueChange={(value) => onFiltersChange({ ...filters, notificationType: value })}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Notification Type" />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* Search bar — always visible */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isQueryTab ? 'Search queries... (try type:query status:open)' : 'Search notifications...'}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-16"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchValue && (
              <button
                onClick={() => setSearchValue('')}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground p-0.5">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">Advanced search syntax:</p>
                  <p><code>type:query</code> or <code>type:notification</code></p>
                  <p><code>status:open</code>, <code>status:responded</code>, <code>status:resolved</code></p>
                  <p><code>sla:overdue</code>, <code>sla:at-risk</code>, <code>sla:on-time</code></p>
                  <p><code>period:Q4</code>, <code>notiftype:kpi_submitted</code></p>
                  <p className="mt-1 text-muted-foreground">Combine with text: <code>type:query status:open target</code></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Mobile: Filter toggle button */}
        {isMobile && (
          <Button
            variant={hasActiveFilters ? 'secondary' : 'outline'}
            size="icon"
            onClick={() => setFiltersOpen(prev => !prev)}
            className="shrink-0 min-h-[44px] min-w-[44px]"
          >
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Filter dropdowns — collapsible on mobile, always visible on desktop */}
      {isMobile ? (
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent className="space-y-3">
            {filterDropdowns}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="space-y-3">{filterDropdowns}</div>
      )}

      {/* Active Filters Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterCount > 0 && (
            <>
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</span>
              {filters.readStatus !== 'all' && (
                <Badge variant="secondary" className="text-xs">
                  {filters.readStatus === 'unread' ? 'Unread' : 'Read'}
                </Badge>
              )}
              {filters.dateRange !== 'all' && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {filters.dateRange === 'week' ? 'This Week' : filters.dateRange === 'month' ? 'This Month' : filters.dateRange}
                </Badge>
              )}
              {filters.queryStatus !== 'all' && (
                <Badge variant="secondary" className="text-xs capitalize">{filters.queryStatus}</Badge>
              )}
              {filters.slaStatus !== 'all' && (
                <Badge variant="secondary" className="text-xs capitalize">{filters.slaStatus}</Badge>
              )}
              {filters.notificationType !== 'all' && (
                <Badge variant="secondary" className="text-xs">
                  {NOTIFICATION_TYPES.find(t => t.value === filters.notificationType)?.label || filters.notificationType}
                </Badge>
              )}
            </>
          )}
          {showAdvancedHint && (
            <Badge variant="outline" className="text-xs text-primary">Advanced syntax active</Badge>
          )}
        </div>
        {showingCount !== undefined && totalCount !== undefined && (
          <span className="text-muted-foreground">
            Showing {showingCount} of {totalCount}
          </span>
        )}
      </div>
    </div>
  );
}
