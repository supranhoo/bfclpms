import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { History } from 'lucide-react';

interface ProfileCardProps {
  profile: {
    full_name?: string | null;
    designation?: string | null;
    employee_code?: string | null;
    avatar_url?: string | null;
    email?: string;
    department?: { name: string } | null;
  };
  department?: string;
  division?: string;
  onViewHistory?: () => void;
}

export function ProfileCard({ profile, department, division, onViewHistory }: ProfileCardProps) {
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-lg">{getInitials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold text-foreground">{profile.full_name || 'User'}</h2>
              <p className="text-muted-foreground">{profile.designation || 'Employee'}</p>
              {profile.employee_code && (
                <span className="text-xs text-muted-foreground font-mono">{profile.employee_code}</span>
              )}
            </div>
          </div>
          {onViewHistory && (
            <Button variant="outline" onClick={onViewHistory}>
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <span className="block text-sm font-medium text-muted-foreground">Full Name</span>
            <span className="text-foreground font-semibold">{profile.full_name || '-'}</span>
          </div>
          <div>
            <span className="block text-sm font-medium text-muted-foreground">Designation</span>
            <span className="text-foreground font-semibold">{profile.designation || '-'}</span>
          </div>
          <div>
            <span className="block text-sm font-medium text-muted-foreground">Department</span>
            <span className="text-foreground font-semibold">{department || '-'}</span>
          </div>
          <div>
            <span className="block text-sm font-medium text-muted-foreground">Employee Code</span>
            <span className="text-foreground font-semibold">{profile.employee_code || '-'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
