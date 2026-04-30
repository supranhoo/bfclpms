import { NavLink, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SafetyNotificationBell } from './SafetyNotificationBell';
import { SafetyOfflineBadge } from './SafetyOfflineBadge';
import {
  Home, AlertTriangle, Settings, ArrowLeft, Users, Timer, ScrollText, LogOut, ShieldAlert,
  FileSignature, ShieldCheck, GraduationCap, BookOpen, Wrench, ClipboardCheck, Siren,
  BarChart3, Activity,
} from 'lucide-react';

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
  { title: 'Permits to Work', url: '/safety/permits', icon: FileSignature },
  { title: 'Assets & Calibration', url: '/safety/assets', icon: Wrench },
  { title: 'Audits & Compliance', url: '/safety/audits', icon: ClipboardCheck },
  { title: 'Emergency Response', url: '/safety/emergency', icon: Siren },
  { title: 'My Training', url: '/safety/training', icon: GraduationCap, end: true },
  { title: 'Training Admin', url: '/safety/training/admin', icon: BookOpen },
  { title: 'Analytics', url: '/safety/analytics', icon: BarChart3 },
  { title: 'Hours Worked', url: '/safety/settings/hours-worked', icon: Activity },
  { title: 'Permit Types', url: '/safety/settings/permit-types', icon: ShieldCheck },
  { title: 'SLA Monitor', url: '/safety/settings/sla', icon: Timer },
  { title: 'Users & Roles', url: '/safety/settings/users', icon: Users },
  { title: 'Audit Log', url: '/safety/settings/audit', icon: ScrollText },
  { title: 'Settings', url: '/safety/settings', icon: Settings, end: true },
];

export function SafetySidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { data: appSettings } = useAppSettings();

  const orgName = appSettings?.organization_name || 'Health, Safety & Environment';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isActive = (url: string, end?: boolean) =>
    end ? pathname === url : pathname === url || pathname.startsWith(url + '/');

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-destructive text-destructive-foreground shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h2 className="font-semibold text-sidebar-foreground truncate">Safety</h2>
                <p className="text-xs text-sidebar-foreground/60 truncate">{orgName}</p>
              </div>
            )}
          </div>
          <SidebarTrigger className="text-sidebar-foreground/60 hover:text-sidebar-foreground shrink-0" />
        </div>
      </SidebarHeader>

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
                    <NavLink to={item.url} end={item.end} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 space-y-3">
        {/* Back to Hub + Theme Toggle row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-primary transition-colors duration-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {!collapsed && <span>Back to Hub</span>}
          </button>
          {!collapsed && <ThemeToggle />}
        </div>

        {/* Notifications + Offline status row */}
        {!collapsed && (
          <div className="flex items-center gap-2">
            <SafetyNotificationBell />
            <SafetyOfflineBadge />
          </div>
        )}

        {/* Profile card */}
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-sidebar-accent/5 border border-sidebar-border/30">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            aria-label="My Profile Settings"
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-destructive/10 text-destructive text-sm font-medium">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-xs text-sidebar-foreground/60">Safety</p>
              </div>
            )}
          </button>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/60 hover:text-destructive transition-colors shrink-0"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}