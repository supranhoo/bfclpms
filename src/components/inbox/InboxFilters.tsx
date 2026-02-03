import { useState, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export interface InboxFiltersState {
  search: string;
  readStatus: 'all' | 'unread' | 'read';
  dateRange: 'today' | 'week' | 'month' | 'all';
}

interface InboxFiltersProps {
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
  totalCount?: number;
  showingCount?: number;
}

export function InboxFilters({ filters, onFiltersChange, totalCount, showingCount }: InboxFiltersProps) {
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
    onFiltersChange({
      search: '',
      readStatus: 'all',
      dateRange: 'all',
    });
  };

  const hasActiveFilters = filters.search || filters.readStatus !== 'all' || filters.dateRange !== 'all';

  const activeFilterCount = [
    filters.search ? 1 : 0,
    filters.readStatus !== 'all' ? 1 : 0,
    filters.dateRange !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <Select
          value={filters.readStatus}
          onValueChange={(value) => onFiltersChange({ ...filters, readStatus: value as InboxFiltersState['readStatus'] })}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>

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

      {/* Active Filters Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
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
            </>
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
