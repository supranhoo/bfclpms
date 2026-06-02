import { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { prefetchRoute } from '@/hooks/usePrefetchRoute';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface MenuItem {
  title: string;
  icon: LucideIcon;
  path: string;
  roles: string[];
  menuKey?: string;
  showBadge?: boolean;
  /** Resolved nested children (universal nesting). Rendered indented. */
  children?: MenuItem[];
}

interface CollapsibleSidebarGroupProps {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onToggle: () => void;
  filterByRole: (items: MenuItem[]) => MenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  hasActiveRoute?: boolean;
  inboxBadgeCount?: number;
}

export function CollapsibleSidebarGroup({
  label,
  items,
  isOpen,
  onToggle,
  filterByRole,
  currentPath,
  onNavigate,
  hasActiveRoute,
  inboxBadgeCount,
}: CollapsibleSidebarGroupProps) {
  const filteredItems = filterByRole(items);
  if (filteredItems.length === 0) return null;

  const renderRow = (item: MenuItem, depth: number) => {
    const filteredKids = item.children ? filterByRole(item.children) : [];
    return (
      <SidebarMenuItem key={`${depth}:${item.path}`}>
        <SidebarMenuButton
          isActive={currentPath === item.path}
          onClick={() => onNavigate(item.path)}
          onMouseEnter={() => prefetchRoute(item.path)}
          onFocus={() => prefetchRoute(item.path)}
          className="transition-colors duration-150 data-[active=true]:font-semibold data-[active=true]:bg-sidebar-accent/15 data-[active=true]:text-sidebar-primary"
          style={depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
          {item.showBadge && inboxBadgeCount && inboxBadgeCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-auto h-5 min-w-5 px-1 flex items-center justify-center text-xs"
            >
              {inboxBadgeCount}
            </Badge>
          )}
        </SidebarMenuButton>
        {filteredKids.length > 0 && (
          <SidebarMenu className="gap-0.5 ml-1 border-l border-sidebar-border/40 pl-1">
            {filteredKids.map((c) => renderRow(c, depth + 1))}
          </SidebarMenu>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-primary/5 rounded-lg mx-1 px-2 py-1.5 flex justify-between items-center min-h-[32px] transition-colors duration-200">
            <div className="flex items-center gap-2">
              {hasActiveRoute && !isOpen && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/80">
                {label}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-sidebar-foreground/50 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-0.5">
              {filteredItems.map((item) => renderRow(item, 0))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
