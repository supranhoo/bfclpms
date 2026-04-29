import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, AlertTriangle, Plus } from 'lucide-react';
import { useSafetyIncidents } from '@/hooks/useSafetyIncidents';
import { SafetyStatusBadge } from '@/components/safety/StatusBadge';
import { SlaBadge } from '@/components/safety/SlaBadge';
import {
  SAFETY_SEVERITY_LABELS,
  SAFETY_TYPE_LABELS,
} from '@/lib/safetyIncidents';
import { format } from 'date-fns';

export default function SafetyIncidents() {
  const { data: incidents = [], isLoading, error } = useSafetyIncidents();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!search.trim()) return incidents;
    const q = search.toLowerCase();
    return incidents.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q) ||
        (i.incident_number ?? '').toLowerCase().includes(q),
    );
  }, [incidents, search]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            Safety Incidents
          </h1>
          <p className="text-sm text-muted-foreground">
            7-stage workflow: Reported → Assigned → Investigation → RCA → CAPA → Verification → Closed
          </p>
        </div>
        <Button asChild>
          <Link to="/safety/incidents/new">
            <Plus className="h-4 w-4 mr-2" />
            Report Incident
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">All visible incidents</CardTitle>
            <Input
              placeholder="Search title, location, or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load incidents: {(error as Error).message}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No incidents found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Reported</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => (
                    <TableRow
                      key={i.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate(`/safety/incidents/${i.id}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {i.incident_number ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">{i.title}</TableCell>
                      <TableCell>{SAFETY_TYPE_LABELS[i.incident_type]}</TableCell>
                      <TableCell>{SAFETY_SEVERITY_LABELS[i.severity]}</TableCell>
                      <TableCell><SafetyStatusBadge status={i.status} /></TableCell>
                      <TableCell><SlaBadge state={i.sla_state} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(i.created_at), 'dd MMM yyyy, HH:mm')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}