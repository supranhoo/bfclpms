import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BarChart3, LogOut, ChevronDown } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function MinimalHeader() {
  const { profile, effectiveRole, signOut } = useAuth();
  const { data: appSettings } = useAppSettings();
  const navigate = useNavigate();

  const displayAppName = appSettings?.app_name || 'PMS Dashboard';
  const displayOrgName = appSettings?.organization_name || 'Performance Management';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            {appSettings?.logo_url ? (
              <img
                src={appSettings.logo_url}
                alt="Logo"
                className="h-9 w-9 rounded-lg object-contain ring-1 ring-border/60"
              />
            ) : (
              <div className="rounded-lg bg-primary p-2 text-primary-foreground shadow-sm ring-1 ring-primary/30">
                <BarChart3 className="h-5 w-5" />
              </div>
            )}
            <div className="leading-tight">
              <h1 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">{displayAppName}</h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{displayOrgName}</p>
            </div>
          </div>

          {/* Theme Toggle & User Menu */}
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {getInitials(profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{effectiveRole}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
