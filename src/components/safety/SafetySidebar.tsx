import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Home, AlertTriangle, Settings, ArrowLeft, Users, Timer } from 'lucide-react';

/**
 * SafetySidebar
 * -------------
 * Sidebar dedicated to the Safety module shell. Intentionally has zero
 * imports from PMS layout components so PMS chrome can never leak into
 * /safety/*. Phase 0 ships only Home and Settings; incident routes light
 * up in Phase 1.
 */

const items = [
  { title: 'Safety Home', url: '/safety', icon: Home, end: true },
  { title: 'Incidents', url: '/safety/incidents', icon: AlertTriangle },
  { title: 'SLA Monitor', url: '/safety/settings/sla', icon: Timer },
  { title: 'Users & Roles', url: '/safety/settings/users', icon: Users },
  { title: 'Settings', url: '/safety/settings', icon: Settings, comingSoon: true },
];

export function SafetySidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();

  const isActive = (url: string, end?: boolean) =>
    end ? pathname === url : pathname === url || pathname.startsWith(url + '/');

  return (
    <Sidebar collapsible="icon">
      <SidebarContent data-testid="safety-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel>Safety</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.end)}
                    tooltip={collapsed ? item.title : undefined}
                  >
                    {item.comingSoon ? (
                      <span
                        className="flex items-center gap-2 opacity-50 cursor-not-allowed"
                        aria-disabled="true"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && (
                          <span className="flex items-center gap-2">
                            {item.title}
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              soon
                            </span>
                          </span>
                        )}
                      </span>
                    ) : (
                      <NavLink to={item.url} end={item.end} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={collapsed ? 'Back to Hub' : undefined}>
                  <NavLink to="/home" className="flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {!collapsed && <span>Back to Hub</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}