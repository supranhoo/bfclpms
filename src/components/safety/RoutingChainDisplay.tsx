import { AlertTriangle, UserCircle2 } from 'lucide-react';
import { useActiveProfilesLite } from '@/hooks/useSafetyOrg';
import { Badge } from '@/components/ui/badge';

interface Props {
  buHeadId: string | null;
  managerId: string | null;
  secondManagerId: string | null;
  routingStatus: 'dept' | 'division' | 'unrouted' | 'legacy' | null;
}

export function RoutingChainDisplay({ buHeadId, managerId, secondManagerId, routingStatus }: Props) {
  const { data: profiles = [] } = useActiveProfilesLite();
  const nameOf = (id: string | null) =>
    !id ? '—' : (profiles.find((p) => p.id === id)?.full_name ?? 'Unknown user');

  const rows: Array<[string, string | null]> = [
    ['BU Head', buHeadId],
    ['Manager', managerId],
    ['2nd Manager', secondManagerId],
  ];

  const isUnrouted = routingStatus === 'unrouted' || (!buHeadId && !managerId && !secondManagerId);

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Routing chain</h3>
        {routingStatus === 'dept' && <Badge variant="secondary">Department rule</Badge>}
        {routingStatus === 'division' && <Badge variant="secondary">Division default</Badge>}
        {routingStatus === 'legacy' && <Badge variant="outline">Legacy</Badge>}
        {isUnrouted && (
          <Badge variant="outline" className="border-amber-500 text-amber-700">
            <AlertTriangle className="h-3 w-3 mr-1" /> Unrouted
          </Badge>
        )}
      </div>
      {isUnrouted ? (
        <p className="text-xs text-muted-foreground">
          No routing rule matched this incident&apos;s business unit / department. Safety Admin / Safety Head will handle it. Configure rules in Safety Settings → Incident Routing.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {rows.map(([label, id]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <UserCircle2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="truncate">{nameOf(id)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RoutingChainDisplay;