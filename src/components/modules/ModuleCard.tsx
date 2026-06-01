import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Target,
  Users,
  GraduationCap,
  BarChart3,
  Building2,
  Briefcase,
  Settings,
  ShieldAlert,
  ArrowUpRight,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleCardProps {
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  route: string;
  isComingSoon?: boolean;
}

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  Target,
  Users,
  GraduationCap,
  BarChart3,
  Building2,
  Briefcase,
  Settings,
  ShieldAlert,
};

export const ModuleCard = React.forwardRef<HTMLDivElement, ModuleCardProps>(function ModuleCard({
  code,
  name,
  description,
  icon,
  color,
  route,
  isComingSoon = false,
}, ref) {
  const navigate = useNavigate();
  const IconComponent = iconMap[icon] || Target;

  const handleClick = () => {
    if (!isComingSoon) {
      navigate(route);
    }
  };

  return (
    <Card
      ref={ref}
      onClick={handleClick}
      role={isComingSoon ? undefined : 'button'}
      tabIndex={isComingSoon ? -1 : 0}
      aria-disabled={isComingSoon || undefined}
      aria-label={isComingSoon ? `${name} (Coming soon)` : `Open ${name}`}
      onKeyDown={(e) => {
        if (isComingSoon) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(route);
        }
      }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/60 bg-card',
        'shadow-sm transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
        isComingSoon
          ? 'cursor-not-allowed bg-muted/30 hover:shadow-sm'
          : 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg'
      )}
    >
      {/* Subtle premium sheen on hover (active cards only) */}
      {!isComingSoon && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
      )}

      {/* Coming Soon Badge */}
      {isComingSoon && (
        <div className="absolute right-3 top-3 z-10 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
          Coming Soon
        </div>
      )}

      <CardHeader className="relative pb-3">
        <div
          className={cn(
            'mb-4 flex h-12 w-12 items-center justify-center rounded-xl ring-1 transition-all duration-300',
            isComingSoon
              ? 'bg-muted text-muted-foreground ring-border/60'
              : 'bg-primary/[0.08] text-primary ring-primary/15 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary/30 group-hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]'
          )}
        >
          <IconComponent className="h-6 w-6" />
        </div>
        <CardTitle className="text-lg font-semibold tracking-tight">{name}</CardTitle>
      </CardHeader>

      <CardContent className="relative pt-0">
        <CardDescription className="line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-muted-foreground">
          {description || 'Access this workspace to get started.'}
        </CardDescription>

        {!isComingSoon && (
          <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
            <span>Open workspace</span>
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
});
