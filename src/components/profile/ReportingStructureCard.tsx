import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users } from 'lucide-react';

interface Manager {
  full_name: string | null;
  designation: string | null;
  avatar_url: string | null;
  employee_code: string | null;
}

export default function ReportingStructureCard({
  manager,
  functionalManager = null,
}: {
  manager: Manager | null;
  functionalManager?: Manager | null;
}) {
  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Reporting Structure
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {manager ? (
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
            <Avatar className="h-12 w-12">
              <AvatarImage src={manager.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {getInitials(manager.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Reporting Manager</p>
              <p className="text-sm font-semibold text-foreground truncate">{manager.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{manager.designation || 'No designation'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No reporting manager assigned</p>
        )}
        {functionalManager && (
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
            <Avatar className="h-12 w-12">
              <AvatarImage src={functionalManager.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                {getInitials(functionalManager.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Functional Manager</p>
              <p className="text-sm font-semibold text-foreground truncate">{functionalManager.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{functionalManager.designation || 'No designation'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
