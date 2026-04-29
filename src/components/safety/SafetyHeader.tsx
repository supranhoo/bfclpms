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
import { ShieldAlert, LogOut, ChevronDown, LayoutGrid } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/**
 * SafetyHeader
 * ------------
 * Header for the Safety shell. Visually distinct from the PMS header
 * (destructive-toned shield logo) so the user always knows which module
 * they are in. Provides a one-click back-to-hub control.
 */
export function SafetyHeader() {
  const { profile, signOut } = useAuth();
  const { data: appSettings } = useAppSettings();
  const navigate = useNavigate();

  const orgName = appSettings?.organization_name || 'Health, Safety & Environment';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const initials = (name: string | null | undefined) =>
    !name ? 'U' : name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header
      className="w-full border-b border-border bg-background"
      data-testid="safety-header"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive text-destructive-foreground">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Safety</h1>
              <p className="text-xs text-muted-foreground">{orgName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/home')}
              className="hidden sm:inline-flex items-center gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              Hub
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 pl-2 pr-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-destructive/10 text-destructive text-sm">
                      {initials(profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">Safety</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/home')}>
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Module Hub
                </DropdownMenuItem>
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