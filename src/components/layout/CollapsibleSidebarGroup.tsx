import { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
  showBadge?: boolean;
}

interface CollapsibleSidebarGroupProps {
  label: string;
  items: MenuItem[];
  isOpen: boolean;
  onToggle: () => void;
  filterByRole: (items: MenuItem[]) => MenuItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  badge?: number;
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
  badge,
  inboxBadgeCount,
}: CollapsibleSidebarGroupProps) {
  const filteredItems = filterByRole(items);
  if (filteredItems.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md px-2 flex justify-between items-center h-8">
            <span>{label}</span>
            <div className="flex items-center gap-1">
              {badge !== undefined && badge > 0 && !isOpen && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                  {badge}
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={currentPath === item.path}
                    onClick={() => onNavigate(item.path)}
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
