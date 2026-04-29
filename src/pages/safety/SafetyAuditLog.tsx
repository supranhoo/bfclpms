import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText, RefreshCw, Loader2 } from 'lucide-react';
import { useSafetyAuditLog } from '@/hooks/useSafetyAuditLog';
import { format } from 'date-fns';

/**
 * Safety Audit Log
 * ----------------
 * Read-only compliance surface. Visible to safety admins (RLS-enforced).
 * Supports server-side filtering by entity_type / event_type and
 * client-side search across performer + details JSON.
 */

const ENTITY_OPTIONS = ['all', 'safety_incident', 'safety_user_role', 'safety_module_access'];
const EVENT_OPTIONS = [
  'all',
  'incident_created',
  'incident_status_changed',
  'incident_assigned',
  'incident_closed',
  'role_granted',
  'role_revoked',
  'module_access_granted',
  'module_access_revoked',
];

export default function SafetyAuditLog() {
  const [entityType, setEntityType] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading, isFetching, refetch } = useSafetyAuditLog({
    entityType: entityType === 'all' ? undefined : entityType,
    eventType: eventType === 'all' ? undefined : eventType,
    search: search.trim() || undefined,
    limit: 300,
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
          <ScrollText className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Audit Log</h1>
          <p className="text-muted-foreground">
            Immutable trail of every Safety mutation — incidents, role grants, access changes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger><SelectValue placeholder="Entity type" /></SelectTrigger>
            <SelectContent>
              {ENTITY_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>{o === 'all' ? 'All entities' : o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger><SelectValue placeholder="Event type" /></SelectTrigger>
            <SelectContent>
              {EVENT_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>{o === 'all' ? 'All events' : o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search performer / details…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isLoading ? 'Loading…' : `${rows.length} entries`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Performer</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Loading audit entries…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No audit entries match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'dd MMM yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">{r.event_type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.entity_type}</div>
                    {r.entity_id && (
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {r.entity_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.performed_by_name ?? (
                      <span className="text-muted-foreground italic">System</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[420px]">
                    <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2 max-h-32 overflow-auto">
{JSON.stringify(r.details, null, 2)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
