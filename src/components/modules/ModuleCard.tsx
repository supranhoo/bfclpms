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
  LucideIcon
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
      className={cn(
        'relative overflow-hidden transition-all duration-300 cursor-pointer group',
        'hover:shadow-lg hover:scale-[1.02] hover:border-primary/50',
        isComingSoon && 'opacity-60 cursor-not-allowed hover:scale-100 hover:shadow-none'
      )}
      onClick={handleClick}
    >
      {/* Gradient background on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      {/* Coming Soon Badge */}
      {isComingSoon && (
        <div className="absolute top-3 right-3 px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
          Coming Soon
        </div>
      )}

      <CardHeader className="relative pb-2">
        <div className={cn(
          'w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-colors',
          'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
        )}>
          <IconComponent className="h-7 w-7" />
        </div>
        <CardTitle className="text-xl font-semibold">{name}</CardTitle>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        <CardDescription className="text-sm text-muted-foreground line-clamp-2">
          {description || 'Access this module to get started.'}
        </CardDescription>
      </CardContent>
    </Card>
  );
});
