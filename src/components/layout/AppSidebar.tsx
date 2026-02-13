import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenQueryCount } from '@/hooks/useOpenQueryCount';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
  Eye,
  ArrowLeft,
  Mail,
  UserCheck,
  ClipboardCheck,
} from 'lucide-react';
import { CollapsibleSidebarGroup } from './CollapsibleSidebarGroup';

const menuItems = {
  main: [
    { title: 'My Dashboard', icon: Home, path: '/dashboard', roles: ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'] },
    { title: 'Inbox', icon: MessageSquare, path: '/queries', roles: ['employee', 'manager', 'admin', 'auditor', 'management'], showBadge: true },
    { title: 'PMS Policy', icon: FileText, path: '/pms-policy', roles: ['admin'] },
  ],
  manager: [
    { title: 'Team Review', icon: Users, path: '/dashboard?view=team', roles: ['manager', 'admin', 'management'] },
    { title: 'Skip-Level Review', icon: UserCheck, path: '/dashboard?view=skip_level', roles: ['manager', 'admin'] },
  ],
  hr_pms: [
    { title: 'HR PMS Review', icon: ClipboardCheck, path: '/dashboard?view=hr_pms', roles: ['hr_pms', 'admin'] },
  ],
  management: [
    { title: 'Management Dashboard', icon: LayoutDashboard, path: '/management-dashboard', roles: ['management', 'admin'] },
    { title: 'Management Review', icon: Briefcase, path: '/dashboard?view=management', roles: ['management', 'admin'] },
  ],
  audit: [
    { title: 'Audit Panel', icon: Shield, path: '/dashboard?view=audit', roles: ['auditor', 'admin'] },
  ],
  admin: [
    { title: 'Admin Dashboard', icon: LayoutDashboard, path: '/admin', roles: ['admin'] },
    { title: 'User Management', icon: Users, path: '/admin/users', roles: ['admin'] },
    { title: 'KRA Library', icon: Library, path: '/admin/templates', roles: ['admin'] },
    { title: 'KRA Bundles', icon: Package, path: '/admin/bundles', roles: ['admin'] },
    { title: 'All KRAs', icon: Target, path: '/admin/kpis', roles: ['admin'] },
    { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', roles: ['admin'] },
    { title: 'Org KPI Overview', icon: Eye, path: '/admin/org-kpi-overview', roles: ['admin'] },
    { title: 'PIP Management', icon: UserX, path: '/admin/pip', roles: ['admin'] },
    { title: 'Workflow Config', icon: GitBranch, path: '/admin/workflow-config', roles: ['admin'] },
    { title: 'Organization', icon: Building2, path: '/admin/organization', roles: ['admin'] },
    { title: 'KRA Categories', icon: ClipboardList, path: '/admin/categories', roles: ['admin'] },
    { title: 'Review Periods', icon: Calendar, path: '/admin/review-periods', roles: ['admin'] },
    { title: 'Import Data', icon: Upload, path: '/admin/import', roles: ['admin'] },
    { title: 'System Settings', icon: Settings, path: '/admin/settings', roles: ['admin'] },
    { title: 'Audit Logs', icon: History, path: '/audit-logs', roles: ['admin'] },
    { title: 'Email Logs', icon: Mail, path: '/admin/email-logs', roles: ['admin'] },
  ],
  dataEntry: [
    { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', roles: ['employee', 'manager', 'auditor', 'management'] },
  ],
  reports: [
    { title: 'View Reports', icon: BarChart3, path: '/reports', roles: ['admin', 'manager', 'auditor', 'management'] },
    { title: 'Performance Report', icon: BarChart3, path: '/reports/performance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'KRA Issuance', icon: FileText, path: '/reports/kra-issuance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'TNI Report', icon: GraduationCap, path: '/reports/tni', roles: ['admin', 'manager', 'auditor'] },
  ],
};

// Helper to determine which section contains a given path (handles query params)
const getSectionForPath = (pathname: string, search: string = ''): string => {
  const fullPath = pathname + search;
  // Check for view query params first
  if (fullPath.includes('view=team')) return 'manager';
  if (fullPath.includes('view=skip_level')) return 'manager';
  if (fullPath.includes('view=audit')) return 'audit';
  if (fullPath.includes('view=management')) return 'management';
  if (fullPath.includes('view=hr_pms')) return 'hr_pms';
  // Check for management dashboard path
  if (pathname === '/management-dashboard') return 'management';
  // Existing path checks
  if (menuItems.main.some(item => pathname === item.path.split('?')[0])) return 'main';
  if (menuItems.admin.some(item => pathname.startsWith(item.path))) return 'admin';
  if (menuItems.reports.some(item => pathname.startsWith(item.path))) return 'reports';
  if (menuItems.hr_pms.some(item => pathname === item.path.split('?')[0])) return 'hr_pms';
  if (pathname === '/admin/org-kpi-data') return 'dataEntry';
  return 'main';
};

export function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const { data: openQueryCount } = useOpenQueryCount();
  const { data: unreadNotificationCount } = useUnreadNotificationCount();
  const { data: appSettings } = useAppSettings();
  const { data: isDataOwner } = useIsAnyOrgKpiDataOwner();

  // Track which sections are open
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    return new Set([getSectionForPath(location.pathname, location.search)]);
  });

  // Auto-expand section when route changes
  useEffect(() => {
    const section = getSectionForPath(location.pathname, location.search);
    setOpenSections(prev => {
      if (prev.has(section)) return prev;
      return new Set([...prev, section]);
    });
  }, [location.pathname, location.search]);

  // Update document title based on app settings
  useEffect(() => {
    if (appSettings?.app_name) {
      document.title = appSettings.app_name;
    }
  }, [appSettings?.app_name]);

  // Combine query count and notification count for inbox badge
  const inboxBadgeCount = (openQueryCount || 0) + (unreadNotificationCount || 0);

  const displayAppName = appSettings?.app_name || 'PMS Dashboard';
  const displayOrgName = appSettings?.organization_name || 'Performance Management';

  const filterByRole = useCallback((items: typeof menuItems.main) => {
    return items.filter(item => role && item.roles.includes(role));
  }, [role]);

  const toggleSection = useCallback((section: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const handleNavigation = useCallback((path: string) => {
    navigate(path);
    // Auto-close sidebar on mobile after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [navigate, isMobile, setOpenMobile]);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {appSettings?.logo_url ? (
              <img src={appSettings.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <div className="p-2.5 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <h2 className="font-semibold text-sidebar-foreground">{displayAppName}</h2>
              <p className="text-xs text-sidebar-foreground/60">{displayOrgName}</p>
            </div>
          </div>
          <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Section */}
        <CollapsibleSidebarGroup
          label="Main"
          items={menuItems.main}
          isOpen={openSections.has('main')}
          onToggle={() => toggleSection('main')}
          filterByRole={filterByRole}
          currentPath={location.pathname + location.search}
          onNavigate={handleNavigation}
          hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'main'}
          inboxBadgeCount={inboxBadgeCount}
        />

        {/* Manager Section */}
        {(role === 'manager' || role === 'management' || role === 'admin') && (
          <CollapsibleSidebarGroup
            label="Manager"
            items={menuItems.manager}
            isOpen={openSections.has('manager')}
            onToggle={() => toggleSection('manager')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'manager'}
          />
        )}

        {/* Management Section */}
        {(role === 'management' || role === 'admin') && (
          <CollapsibleSidebarGroup
            label="Management"
            items={menuItems.management}
            isOpen={openSections.has('management')}
            onToggle={() => toggleSection('management')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'management'}
          />
        )}

        {/* HR PMS Section */}
        {(role === 'hr_pms' || role === 'admin') && (
          <CollapsibleSidebarGroup
            label="HR PMS"
            items={menuItems.hr_pms}
            isOpen={openSections.has('hr_pms')}
            onToggle={() => toggleSection('hr_pms')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'hr_pms'}
          />
        )}

        {/* Audit Section */}
        {(role === 'auditor' || role === 'admin') && (
          <CollapsibleSidebarGroup
            label="Audit"
            items={menuItems.audit}
            isOpen={openSections.has('audit')}
            onToggle={() => toggleSection('audit')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'audit'}
          />
        )}

        {/* Data Entry section for data owners (non-admins) */}
        {role !== 'admin' && isDataOwner && (
          <CollapsibleSidebarGroup
            label="Data Entry"
            items={menuItems.dataEntry}
            isOpen={openSections.has('dataEntry')}
            onToggle={() => toggleSection('dataEntry')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'dataEntry'}
          />
        )}

        {/* Administration Section */}
        {role === 'admin' && (
          <CollapsibleSidebarGroup
            label="Administration"
            items={menuItems.admin}
            isOpen={openSections.has('admin')}
            onToggle={() => toggleSection('admin')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'admin'}
          />
        )}

        {/* Reports Section */}
        {(role === 'admin' || role === 'manager' || role === 'auditor' || role === 'management') && (
          <CollapsibleSidebarGroup
            label="Reports"
            items={menuItems.reports}
            isOpen={openSections.has('reports')}
            onToggle={() => toggleSection('reports')}
            filterByRole={filterByRole}
            currentPath={location.pathname + location.search}
            onNavigate={handleNavigation}
            hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'reports'}
          />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        {/* Back to Hub + Theme Toggle row */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => handleNavigation('/home')}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-primary transition-colors duration-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Hub</span>
          </button>
          <ThemeToggle />
        </div>
        
        {/* Profile card */}
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-sidebar-accent/5 border border-sidebar-border/30">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
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
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-destructive transition-colors"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
