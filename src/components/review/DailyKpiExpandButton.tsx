import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';

interface DailyKpiExpandButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  showBadge?: boolean;
}

export function DailyKpiExpandButton({ 
  isExpanded, 
  onToggle,
  showBadge = false
}: DailyKpiExpandButtonProps) {
  if (showBadge) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="h-7 px-2 text-xs gap-1 hover:bg-blue-50 dark:hover:bg-blue-950/30"
      >
        <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        <span className="text-blue-600 dark:text-blue-400">Daily</span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronDown className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="h-7 w-7 p-0"
      title={isExpanded ? "Hide daily submissions" : "Show daily submissions"}
    >
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      {isExpanded ? (
        <ChevronUp className="h-3 w-3 ml-0.5" />
      ) : (
        <ChevronDown className="h-3 w-3 ml-0.5" />
      )}
    </Button>
  );
}

// Badge to show in KRA/KPI cell for Daily KPIs
export function DailyBadge() {
  return (
    <Badge 
      variant="outline" 
      className="text-xs h-5 px-1.5 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
    >
      <Calendar className="h-3 w-3 mr-0.5" />
      Daily
    </Badge>
  );
}
