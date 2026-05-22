import { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOpenQueryCount } from '@/hooks/useOpenQueryCount';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import { useMenuAccess } from '@/hooks/useMenuAccess';
import { useBulkReviewFlag } from '@/hooks/useBulkReview';
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
import { Switch } from '@/components/ui/switch';
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
  GitMerge,
  LayoutDashboard,
  Package,
  GraduationCap,
  StickyNote,
  UserX,
  Eye,
  ArrowLeft,
  Mail,
  UserCheck,
  ClipboardCheck,
  ShieldCheck,
  Undo2,
  Percent,
  FileInput,
  Layers,
} from 'lucide-react';
import { CollapsibleSidebarGroup } from './CollapsibleSidebarGroup';

// NOTE: Keep role arrays in sync with ALL_APP_ROLES in src/lib/roles.ts
const getStaticMenuItems = (policyVisibleRoles: string[]) => ({
  main: [
    { title: 'My Dashboard', icon: Home, path: '/dashboard', menuKey: 'dashboard', roles: ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level'] },
    { title: 'Inbox', icon: MessageSquare, path: '/queries', menuKey: 'inbox', roles: ['employee', 'manager', 'admin', 'auditor', 'management', 'hr_pms', 'skip_level'], showBadge: true },
    { title: 'PMS Policy', icon: FileText, path: '/pms-policy', menuKey: 'pms-policy', roles: [...new Set(['admin', ...policyVisibleRoles])] },
    { title: 'KPI Registry', icon: GitMerge, path: '/registry', menuKey: 'registry-browser', roles: ['admin', 'manager', 'hr_pms', 'management', 'auditor', 'skip_level'] },
  ],
  manager: [
    { title: 'Team Reviews', icon: Users, path: '/dashboard?view=team', menuKey: 'team-reviews', roles: ['manager', 'admin', 'management'] },
  ],
  hr_pms: [
    { title: 'HR PMS Review', icon: ClipboardCheck, path: '/dashboard?view=hr_pms', menuKey: 'hr-pms-review', roles: ['hr_pms', 'admin'] },
    { title: 'Review Notes', icon: StickyNote, path: '/hr/review-notes', roles: ['admin', 'hr_pms', 'manager', 'skip_level', 'management', 'auditor', 'employee'] },
  ],
  management: [
    { title: 'Management Dashboard', icon: LayoutDashboard, path: '/management-dashboard', menuKey: 'management-dashboard', roles: ['management', 'admin'] },
    { title: 'Management Review', icon: Briefcase, path: '/dashboard?view=management', menuKey: 'management-review', roles: ['management', 'admin'] },
    { title: 'Explore Employees (Read-Only)', icon: Eye, path: '/dashboard?view=management&explore=1', menuKey: 'management-review', roles: ['management', 'admin'] },
  ],
  audit: [
    { title: 'Audit Panel', icon: Shield, path: '/dashboard?view=audit', menuKey: 'audit-panel', roles: ['auditor', 'admin'] },
    { title: 'Explore Employees (Read-Only)', icon: Eye, path: '/dashboard?view=audit&explore=1', menuKey: 'audit-panel', roles: ['auditor', 'admin'] },
    { title: 'Org KPI Audit Review', icon: ShieldCheck, path: '/admin/org-kpi-audit-review', menuKey: 'admin-org-kpi-audit', roles: ['auditor', 'admin'] },
  ],
  admin: [
    { title: 'Admin Dashboard', icon: LayoutDashboard, path: '/admin', menuKey: 'admin-dashboard', roles: ['admin'] },
    { title: 'User Management', icon: Users, path: '/admin/users', menuKey: 'admin-users', roles: ['admin'] },
    { title: 'KRA Library', icon: Library, path: '/admin/templates', menuKey: 'admin-templates', roles: ['admin'] },
    { title: 'KRA Bundles', icon: Package, path: '/admin/bundles', menuKey: 'admin-bundles', roles: ['admin'] },
    { title: 'All KRAs', icon: Target, path: '/admin/kpis', menuKey: 'admin-kpis', roles: ['admin'] },
    { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', menuKey: 'admin-org-kpi-data', roles: ['admin'] },
    { title: 'Org KPI Overview', icon: Eye, path: '/admin/org-kpi-overview', menuKey: 'admin-org-kpi-overview', roles: ['admin'] },
    { title: 'PIP Management', icon: UserX, path: '/admin/pip', menuKey: 'admin-pip', roles: ['admin'] },
    { title: 'Workflow Config', icon: GitBranch, path: '/admin/workflow-config', menuKey: 'admin-workflow', roles: ['admin'] },
    { title: 'Organization', icon: Building2, path: '/admin/organization', menuKey: 'admin-organization', roles: ['admin'] },
    { title: 'KRA Categories', icon: ClipboardList, path: '/admin/categories', menuKey: 'admin-categories', roles: ['admin'] },
    { title: 'Review Periods', icon: Calendar, path: '/admin/review-periods', menuKey: 'admin-review-periods', roles: ['admin'] },
    { title: 'Import Data', icon: Upload, path: '/admin/import', menuKey: 'admin-import', roles: ['admin'] },
    { title: 'System Settings', icon: Settings, path: '/admin/settings', menuKey: 'admin-settings', roles: ['admin'] },
    { title: 'Module Hub', icon: Settings, path: '/admin/module-hub', menuKey: 'admin-settings', roles: ['admin'] },
    { title: 'Audit Logs', icon: History, path: '/audit-logs', menuKey: 'admin-audit-logs', roles: ['admin'] },
    { title: 'Observations', icon: Eye, path: '/admin/observations', menuKey: 'admin-observations', roles: ['admin'] },
    { title: 'Rollback Requests', icon: Undo2, path: '/admin/rollback-requests', menuKey: 'admin-rollback', roles: ['admin'] },
    { title: 'Email Logs', icon: Mail, path: '/admin/email-logs', menuKey: 'admin-email-logs', roles: ['admin'] },
    { title: 'KPI Mapping', icon: Target, path: '/admin/kpi-mapping', menuKey: 'admin-kpi-mapping', roles: ['admin'] },
    { title: 'Weightage Matrix', icon: Percent, path: '/admin/kpi-weightage', menuKey: 'admin-weightage', roles: ['admin'] },
    { title: 'Pending Reviews', icon: ClipboardCheck, path: '/admin/pending-reviews', menuKey: 'admin-pending-reviews', roles: ['admin'] },
    { title: 'Incentive Config', icon: Percent, path: '/admin/incentive-config', menuKey: 'admin-incentive', roles: ['admin'] },
    { title: 'Incentive Data Entry', icon: FileInput, path: '/admin/incentive-data-entry', menuKey: 'admin-incentive-data', roles: ['admin'] },
    { title: 'Employee Development', icon: GraduationCap, path: '/admin/employee-development', menuKey: 'admin-development', roles: ['admin', 'hr_pms'] },
    { title: 'KPI Standardization', icon: GitMerge, path: '/admin/kpi-standardization', menuKey: 'admin-kpi-standardization', roles: ['admin'] },
  ],
  dataEntry: [
    { title: 'Org KPI Data Entry', icon: Building2, path: '/admin/org-kpi-data', menuKey: 'data-entry', roles: ['employee', 'manager', 'auditor', 'management', 'hr_pms'] },
    { title: 'Incentive Data Entry', icon: FileInput, path: '/admin/incentive-data-entry', menuKey: 'admin-incentive-data', roles: ['employee', 'manager', 'auditor', 'management', 'hr_pms'] },
  ],
  reports: [
    { title: 'View Reports', icon: BarChart3, path: '/reports', menuKey: 'reports-hub', roles: ['admin', 'manager', 'auditor', 'management'] },
    { title: 'Performance Report', icon: BarChart3, path: '/reports/performance', menuKey: 'reports-performance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'KRA Issuance', icon: FileText, path: '/reports/kra-issuance', menuKey: 'reports-kra-issuance', roles: ['admin', 'manager', 'auditor'] },
    { title: 'TNI Report', icon: GraduationCap, path: '/reports/tni', menuKey: 'reports-tni', roles: ['admin', 'manager', 'auditor'] },
    { title: 'Incentive Report', icon: Percent, path: '/reports/incentive', menuKey: 'reports-incentive', roles: ['admin', 'management', 'hr_pms'] },
  ],
});

// Helper to determine which section contains a given path (handles query params)
const getSectionForPath = (pathname: string, search: string = ''): string => {
  const fullPath = pathname + search;
  if (fullPath.includes('view=team')) return 'manager';
  if (fullPath.includes('view=skip_level')) return 'manager';
  if (fullPath.includes('view=audit')) return 'audit';
  if (fullPath.includes('view=management')) return 'management';
  if (fullPath.includes('view=hr_pms')) return 'hr_pms';
  if (pathname === '/management-dashboard') return 'management';
  if (['/dashboard', '/queries', '/pms-policy', '/registry'].includes(pathname)) return 'main';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname === '/audit-logs') return 'admin';
  return 'main';
};

export function AppSidebar() {
  const { profile, role, effectiveRole, isAdminMode, toggleAdminMode, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const { data: openQueryCount } = useOpenQueryCount();
  const { data: unreadNotificationCount } = useUnreadNotificationCount();
  const { data: appSettings } = useAppSettings();
  const { data: isDataOwner } = useIsAnyOrgKpiDataOwner();
  const { canAccess, canPerform, userOverrides } = useMenuAccess();
  const { data: bulkReviewFlagOn } = useBulkReviewFlag();

  const policyVisibleRoles = appSettings?.pms_policy_visible_roles || ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'];
  const menuItems = getStaticMenuItems(policyVisibleRoles);

  // Flag-gated additive entry — PRD v2.0 §0 Non-Regression Contract.
  // Hidden unless `feature_bulk_review_dashboard = true` AND user is a reviewer.
  if (bulkReviewFlagOn) {
    menuItems.manager = [
      ...menuItems.manager,
      {
        title: 'Bulk Review (Beta)',
        icon: Layers,
        path: '/review/bulk-scoring',
        roles: ['admin', 'manager', 'skip_level', 'hr_pms', 'auditor', 'management'],
      } as any,
    ];
  }

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
    return items.filter(item => {
      if (!effectiveRole) return false;
      // Use DB-driven access if menuKey exists, else fallback to hardcoded roles
      if ('menuKey' in item && item.menuKey) {
        return canAccess(item.menuKey);
      }
      return item.roles.includes(effectiveRole);
    });
  }, [effectiveRole, canAccess]);

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
        <CollapsibleSidebarGroup
          label="Manager"
          items={[
            { title: 'Team Reviews', icon: Users, path: '/dashboard?view=team', menuKey: 'team-reviews', roles: ['manager', 'admin', 'management', 'skip_level'] },
          ]}
          isOpen={openSections.has('manager')}
          onToggle={() => toggleSection('manager')}
          filterByRole={filterByRole}
          currentPath={location.pathname + location.search}
          onNavigate={handleNavigation}
          hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'manager'}
        />

        {/* Management Section */}
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

        {/* HR PMS Section */}
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

        {/* Audit Section */}
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

        {/* Data Entry section for data owners or users with override */}
        <CollapsibleSidebarGroup
          label="Data Entry"
          items={menuItems.dataEntry}
          isOpen={openSections.has('dataEntry')}
          onToggle={() => toggleSection('dataEntry')}
          filterByRole={(items) => {
            // BUG-040: Show Data Entry only when the user is a designated org KPI
            // data owner OR has an explicit per-user menu override. Role-default
            // access is intentionally NOT sufficient because DataOwnerRoute
            // (App.tsx) will redirect non-owners away — showing the menu in
            // that case creates a confusing menu→redirect loop.
            return items.filter(item => {
              if (!effectiveRole) return false;
              if (effectiveRole === 'admin') return false; // admins see it in Administration
              if (!item.menuKey) return false;
              const hasUserOverride = !!profile?.id && userOverrides.some(
                o => o.menu_key === item.menuKey && o.user_id === profile.id
              );
              // BUG-041: parity with DataOwnerRoute — also admit profile-based view rights.
              const hasProfileViewRight = canPerform(item.menuKey, 'view');
              return Boolean(isDataOwner) || hasUserOverride || hasProfileViewRight;
            });
          }}
          currentPath={location.pathname + location.search}
          onNavigate={handleNavigation}
          hasActiveRoute={getSectionForPath(location.pathname, location.search) === 'dataEntry'}
        />

        {/* Administration Section */}
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

        {/* Reports Section */}
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        {/* Admin View Toggle (only for admin users) */}
        {role === 'admin' && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-sidebar-accent/5 border border-sidebar-border/30">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-sidebar-foreground">Admin View</span>
            </div>
            <Switch
              checked={isAdminMode}
              onCheckedChange={toggleAdminMode}
              aria-label="Toggle admin view"
            />
          </div>
        )}

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
          <button
            onClick={() => handleNavigation('/profile')}
            className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            aria-label="My Profile Settings"
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{effectiveRole}</p>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-destructive transition-colors shrink-0"
            onClick={handleSignOut}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
