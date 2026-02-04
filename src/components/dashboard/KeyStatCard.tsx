import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KeyStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  valueClassName?: string;
}

export function KeyStatCard({ title, value, subtitle, icon: Icon, valueClassName = '' }: KeyStatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon && <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
        <div className={`text-lg sm:text-2xl lg:text-3xl font-bold ${valueClassName}`}>{value}</div>
        {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
