import { Badge } from '@/components/ui/badge';
import { Calendar, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FrequencyBadgeSize = 'sm' | 'xs';

interface FrequencyBadgeProps {
  frequency?: string | null;
  size?: FrequencyBadgeSize;
  className?: string;
}

/**
 * Canonical frequency pill for KPI rows on dashboard & review surfaces.
 * Monthly returns null (implicit default — suppressed to reduce noise).
 * Unknown frequencies return null.
 */
export function FrequencyBadge({ frequency, size = 'sm', className }: FrequencyBadgeProps) {
  if (!frequency || frequency === 'Monthly') return null;

  const sizing =
    size === 'xs'
      ? 'text-[10px] px-1 py-0 h-4'
      : 'text-[10px] px-1.5 py-0 h-4';

  const config: Record<string, { label: string; classes: string; icon?: typeof Calendar }> = {
    Daily: {
      label: 'Daily',
      classes:
        'border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30',
      icon: Calendar,
    },
    Weekly: {
      label: 'Weekly',
      classes:
        'border-sky-300 text-sky-700 dark:border-sky-600 dark:text-sky-400',
      icon: CalendarDays,
    },
    'Bi-Monthly': {
      label: 'Bi-Monthly',
      classes:
        'border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-400',
    },
    Quarterly: {
      label: 'Quarterly',
      classes:
        'border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-400',
    },
    'Half-Yearly': {
      label: 'Half-Yearly',
      classes:
        'border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400',
    },
    Yearly: {
      label: 'Yearly',
      classes:
        'border-rose-300 text-rose-700 dark:border-rose-600 dark:text-rose-400',
    },
  };

  const entry = config[frequency];
  if (!entry) return null;

  const Icon = entry.icon;

  return (
    <Badge
      variant="outline"
      className={cn(sizing, 'shrink-0 gap-0.5', entry.classes, className)}
    >
      {Icon && <Icon className="h-2.5 w-2.5" />}
      {entry.label}
    </Badge>
  );
}
