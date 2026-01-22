import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenQueryCount } from '@/hooks/useOpenQueryCount';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  ClipboardList,
  FileText,
  Home,
  LogOut,
  Settings,
  Shield,
  Users,
  Building2,
  Upload,
  Target,
  MessageSquare,
  History,
  Briefcase,
  Calendar,
  GitBranch,
  Library,
  LayoutDashboard,
  Package,
  GraduationCap,
  UserX,
} from 'lucide-react';

const menuItems = {
  main: [
    { title: 'Dashboard', icon: Home, path: '/dashboard', roles: ['admin', 'manager', 'employee', 'auditor', 'management'] },
    // My KPIs combines KPI viewing and self-review submission
    { title: 'My KPIs', icon: Target, path: '/my-kpis', roles: ['employee', 'manager', 'auditor', 'admin', 'management'] },
    { title: 'Inbox', icon: MessageSquare, path: '/queries', roles: ['employee', 'manager', 'admin', 'auditor', 'management'], showBadge: true },
  ],
  manager: [
    { title: 'Team Review', icon: Users, path: '/team-review', roles: ['manager', 'admin', 'management'] },
  ],
  management: [
    { title: 'Management Dashboard', icon: LayoutDashboard, path: '/management-dashboard', roles: ['management', 'admin'] },
    { title: 'Management Review', icon: Briefcase, path: '/management-review', roles: ['management', 'admin'] },
  ],
  audit: [
    { title: 'Audit Panel', icon: Shield, path: '/audit', roles: ['auditor', 'admin'] },
  ],
  admin: [
    { title: 'Admin Dashboard', icon: LayoutDashboard, path: '/admin', roles: ['admin'] },
    { title: 'User Management', icon: Users, path: '/admin/users', roles: ['admin'] },
    { title: 'KRA Library', icon: Library, path: '/admin/templates', roles: ['admin'] },
    { title: 'KRA Bundles', icon: Package, path: '/admin/bundles', roles: ['admin'] },
    { title: 'All KRAs', icon: Target, path: '/admin/kpis', roles: ['admin'] },
    { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', roles: ['admin'] },
    { title: 'PIP Management', icon: UserX, path: '/admin/pip', roles: ['admin'] },
    { title: 'Workflow Config', icon: GitBranch, path: '/admin/workflow-config', roles: ['admin'] },
    { title: 'Organization', icon: Building2, path: '/admin/organization', roles: ['admin'] },
    { title: 'KRA Categories', icon: ClipboardList, path: '/admin/categories', roles: ['admin'] },
    { title: 'Review Periods', icon: Calendar, path: '/admin/review-periods', roles: ['admin'] },
    { title: 'Import Data', icon: Upload, path: '/admin/import', roles: ['admin'] },
    { title: 'System Settings', icon: Settings, path: '/admin/settings', roles: ['admin'] },
    { title: 'Audit Logs', icon: History, path: '/audit-logs', roles: ['admin'] },
  ],
  reports: [
    { title: 'View Reports', icon: BarChart3, path: '/reports', roles: ['admin', 'manager', 'auditor', 'management'] },
    { title: 'Performance Report', icon: BarChart3, path: '/reports/performance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'KRA Issuance', icon: FileText, path: '/reports/kra-issuance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'TNI Report', icon: GraduationCap, path: '/reports/tni', roles: ['admin', 'manager', 'auditor'] },
  ],
};

export function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: openQueryCount } = useOpenQueryCount();
  const { data: unreadNotificationCount } = useUnreadNotificationCount();
  
  // Combine query count and notification count for inbox badge
  const inboxBadgeCount = (openQueryCount || 0) + (unreadNotificationCount || 0);
  const filterByRole = (items: typeof menuItems.main) => {
    return items.filter(item => role && item.roles.includes(role));
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-sidebar-foreground">PMS Dashboard</h2>
            <p className="text-xs text-sidebar-foreground/60">Performance Management</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByRole(menuItems.main).map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                    {'showBadge' in item && item.showBadge && inboxBadgeCount > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                        {inboxBadgeCount}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(role === 'manager' || role === 'management' || role === 'admin') && (
          <SidebarGroup>
            <SidebarGroupLabel>Manager</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(menuItems.manager).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(role === 'management' || role === 'admin') && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(menuItems.management).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(role === 'auditor' || role === 'admin') && (
          <SidebarGroup>
            <SidebarGroupLabel>Audit</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(menuItems.audit).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(menuItems.admin).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(role === 'admin' || role === 'manager' || role === 'auditor') && (
          <SidebarGroup>
            <SidebarGroupLabel>Reports</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filterByRole(menuItems.reports).map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={location.pathname === item.path}
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {profile?.full_name || 'User'}
            </p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
