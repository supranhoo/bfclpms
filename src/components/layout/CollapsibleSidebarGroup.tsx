import { LucideIcon, ChevronDown, Folder, icons as LucideIcons } from 'lucide-react';
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
  icon: LucideIcon | string | null;
  path: string;
  roles: string[];
  menuKey?: string;
  showBadge?: boolean;
  /** Resolved nested children (universal nesting). Rendered indented. */
  children?: MenuItem[];
  /** Semantic color token (e.g. 'primary') applied to icon. */
  color?: string | null;
  /** When true, render as external <a target="_blank"> instead of router nav. */
  external?: boolean;
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
    const IconCmp: LucideIcon = (() => {
      if (!item.icon) return Folder;
      if (typeof item.icon === 'string') {
        const fromMap = (LucideIcons as Record<string, LucideIcon>)[item.icon];
        return fromMap ?? Folder;
      }
      return item.icon;
    })();
    const colorCls = item.color === 'primary' ? 'text-primary'
      : item.color === 'secondary' ? 'text-secondary-foreground'
      : item.color === 'accent' ? 'text-accent-foreground'
      : item.color === 'destructive' ? 'text-destructive'
      : item.color === 'muted' ? 'text-muted-foreground'
      : '';
    const isExternal = item.external || /^https?:\/\//i.test(item.path || '');
    return (
      <SidebarMenuItem key={`${depth}:${item.path}`}>
        <SidebarMenuButton
          isActive={!isExternal && currentPath === item.path}
          onClick={() => {
            if (isExternal && item.path) {
              window.open(item.path, '_blank', 'noopener,noreferrer');
            } else if (item.path) {
              onNavigate(item.path);
            }
          }}
          onMouseEnter={() => !isExternal && item.path && prefetchRoute(item.path)}
          onFocus={() => !isExternal && item.path && prefetchRoute(item.path)}
          className="transition-colors duration-150 data-[active=true]:font-semibold data-[active=true]:bg-sidebar-accent/15 data-[active=true]:text-sidebar-primary"
          style={depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined}
        >
          <IconCmp className={cn('h-4 w-4', colorCls)} />
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
