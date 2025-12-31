/**
 * Shared filter component for review pages
 */

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, LucideIcon } from 'lucide-react';

interface TabConfig {
  value: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface CategoryConfig {
  id: string;
  name: string;
  color: string | null;
}

interface ReviewFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  categories?: CategoryConfig[];
  selectedCategory: string | null;
  onCategoryChange: (categoryId: string | null) => void;
}

export function ReviewFilters({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search employee, KRA, or KPI...',
  tabs,
  activeTab,
  onTabChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: ReviewFiltersProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status Tabs */}
          <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1">
            <TabsList className={`grid w-full grid-cols-${Math.min(tabs.length, 4)} max-w-md`}>
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {tab.count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {/* Category Pills */}
        {categories && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant={selectedCategory === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => onCategoryChange(null)}
              className="h-8"
            >
              All Categories
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => onCategoryChange(cat.id)}
                className="h-8"
              >
                <div
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: cat.color || '#6B7280' }}
                />
                {cat.name}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
