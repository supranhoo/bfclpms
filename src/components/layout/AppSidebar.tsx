import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  CheckSquare,
  MessageSquare,
} from 'lucide-react';

const menuItems = {
  main: [
    { title: 'Dashboard', icon: Home, path: '/dashboard', roles: ['admin', 'manager', 'employee', 'auditor'] },
    { title: 'My KPIs', icon: Target, path: '/my-kpis', roles: ['employee', 'manager'] },
    { title: 'Self Review', icon: CheckSquare, path: '/self-review', roles: ['employee', 'manager', 'admin'] },
    { title: 'Query Inbox', icon: MessageSquare, path: '/queries', roles: ['employee', 'manager', 'admin', 'auditor'] },
  ],
  manager: [
    { title: 'Team Review', icon: Users, path: '/team-review', roles: ['manager', 'admin'] },
  ],
  audit: [
    { title: 'Audit Panel', icon: Shield, path: '/audit', roles: ['auditor'] },
  ],
  admin: [
    { title: 'User Management', icon: Users, path: '/admin/users', roles: ['admin'] },
    { title: 'All KRAs', icon: Target, path: '/admin/kpis', roles: ['admin'] },
    { title: 'Organization', icon: Building2, path: '/admin/organization', roles: ['admin'] },
    { title: 'KRA Categories', icon: ClipboardList, path: '/admin/categories', roles: ['admin'] },
    { title: 'Import Data', icon: Upload, path: '/admin/import', roles: ['admin'] },
  ],
  reports: [
    { title: 'Performance Report', icon: BarChart3, path: '/reports/performance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'KRA Issuance', icon: FileText, path: '/reports/kra-issuance', roles: ['admin', 'manager', 'auditor'] },
  ],
};

export function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(role === 'manager' || role === 'admin') && (
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

        {role === 'auditor' && (
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
