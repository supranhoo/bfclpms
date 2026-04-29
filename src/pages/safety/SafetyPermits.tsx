import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, FileSignature, Loader2, Search, ArrowRight } from 'lucide-react';
import {
  useSafetyPermits,
} from '@/hooks/useSafetyPermits';
import {
  SAFETY_PERMIT_STATUSES,
  SAFETY_PERMIT_STATUS_LABEL,
  SAFETY_PERMIT_TYPES,
  SAFETY_PERMIT_TYPE_LABEL,
  type SafetyPermitStatus,
  type SafetyPermitType,
} from '@/lib/safetyPermits';
import { PermitStatusBadge } from '@/components/safety/PermitStatusBadge';
import { format } from 'date-fns';

/**
 * Permit list with quick filters by status, type, and free-text search on
 * scope/location/permit number. Empty state guides the user to create one.
 */
export default function SafetyPermits() {
  const [status, setStatus] = useState<SafetyPermitStatus | 'all'>('all');
  const [type, setType] = useState<SafetyPermitType | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useSafetyPermits({
    status,
    permitType: type,
    search,
  });

  const grouped = useMemo(() => {
    const live = rows.filter((r) =>
      ['active', 'in_approval', 'submitted', 'approved'].includes(r.status),
    );
    const other = rows.filter((r) => !live.includes(r));
    return { live, other };
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <FileSignature className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Permits to Work</h1>
          <p className="text-muted-foreground">
            Issue, approve, activate, and close work permits across BUs and departments.
          </p>
        </div>
        <Button asChild>
          <Link to="/safety/permits/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Permit
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow the queue by status, type, or text.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SAFETY_PERMIT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SAFETY_PERMIT_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {SAFETY_PERMIT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{SAFETY_PERMIT_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scope, location, permit no…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading permits…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileSignature className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No permits match these filters yet.
            </p>
            <Button asChild>
              <Link to="/safety/permits/new">
                <Plus className="h-4 w-4 mr-2" /> Create the first permit
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && grouped.live.length > 0 && (
        <PermitListSection
          title="Live & In-flight"
          description="Active, awaiting approval, or recently approved."
          rows={grouped.live}
        />
      )}
      {!isLoading && grouped.other.length > 0 && (
        <PermitListSection
          title="History"
          description="Drafts, closed, expired, or rejected permits."
          rows={grouped.other}
        />
      )}
    </div>
  );
}

function PermitListSection({
  title, description, rows,
}: {
  title: string;
  description: string;
  rows: ReturnType<typeof useSafetyPermits>['data'] extends Array<infer R> ? R[] : never;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            to={`/safety/permits/${r.id}`}
            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {r.permit_number ?? '—'} · {SAFETY_PERMIT_TYPE_LABEL[r.permit_type]}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {r.scope} · {r.location} · {format(new Date(r.start_at), 'dd MMM HH:mm')}
                {' → '}
                {format(new Date(r.end_at), 'dd MMM HH:mm')}
              </div>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              L{r.current_level}/{r.total_levels}
            </div>
            <PermitStatusBadge status={r.status} />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}