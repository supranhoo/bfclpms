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

  // Format: "Name (Employee Code)"
  const displayName = profile.full_name 
    ? profile.employee_code 
      ? `${profile.full_name} (${profile.employee_code})`
      : profile.full_name
    : 'User';

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-lg">{getInitials(profile.full_name)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">{displayName}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {profile.designation && <span>{profile.designation}</span>}
                {profile.designation && department && <span className="text-border">|</span>}
                {department && <span>{department}</span>}
              </div>
            </div>
          </div>
          {onViewHistory && (
            <Button variant="outline" onClick={onViewHistory}>
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
