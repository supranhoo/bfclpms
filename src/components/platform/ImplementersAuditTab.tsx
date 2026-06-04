/**
 * Phase 4F — Implementers Audit Log (owner-only, read-only).
 *
 * Renders rows from `entitlement_audit` produced by Phase 4D (`manage-implementer`)
 * and Phase 3G (test email sends). RLS already restricts SELECT to platform_owner;
 * this component additionally hides itself if the caller is not platform_owner.
 *
 * All emails (actor, target, recipient_masked, raw email fields in before/after)
 * are masked before display. No CSV export (Phase 4C).
 */
import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  useImplementersAuditLog,
  extractTargetUserId,
  type AuditScope,
  type AuditRow,
  type ProfileLite,
} from '@/hooks/useImplementersAuditLog';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

const SCOPE_LABELS: Record<AuditScope, string> = {
  grant_role: 'Grant role',
  revoke_role: 'Revoke role',
  assign_client: 'Assign client',
  unassign_client: 'Unassign client',
  test_email_send: 'Test email send',
};

const DEFAULT_SCOPES: AuditScope[] = ['grant_role', 'revoke_role', 'assign_client', 'unassign_client'];

const SINCE_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function maskEmail(email?: string | null) {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Recursively walk JSON and mask any string that looks like an email,
 * plus any key whose name suggests an email field. Returns a deep clone.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEY_RE = /email|recipient|to_address|from_address/i;

function maskJsonPII(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return EMAIL_RE.test(value) ? maskEmail(value) : value;
  }
  if (Array.isArray(value)) return value.map(maskJsonPII);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && EMAIL_KEY_RE.test(k) && EMAIL_RE.test(v)) {
        out[k] = maskEmail(v);
      } else {
        out[k] = maskJsonPII(v);
      }
    }
    return out;
  }
  return value;
}

function profileLabel(p?: ProfileLite | null): string {
  if (!p) return '—';
  const name = p.full_name || p.email || p.id.slice(0, 8);
  return `${name} (${maskEmail(p.email)})`;
}

function reasonToScope(reason: string | null): AuditScope | 'other' {
  if (!reason) return 'other';
  if (reason === 'impl_console_grant_role') return 'grant_role';
  if (reason === 'impl_console_revoke_role') return 'revoke_role';
  if (reason === 'impl_console_assign_client') return 'assign_client';
  if (reason === 'impl_console_unassign_client') return 'unassign_client';
  if (reason.startsWith('impl_console_test_email_send_')) return 'test_email_send';
  return 'other';
}

function ScopeBadge({ scope }: { scope: AuditScope | 'other' }) {
  const v =
    scope === 'grant_role' || scope === 'assign_client'
      ? 'default'
      : scope === 'revoke_role' || scope === 'unassign_client'
        ? 'destructive'
        : 'secondary';
  return <Badge variant={v as any}>{scope === 'other' ? 'Other' : SCOPE_LABELS[scope]}</Badge>;
}

function useClientPicker() {
  return useQuery({
    queryKey: ['impl-audit', 'clients-picker'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, display_name, client_key')
        .order('display_name');
      return data ?? [];
    },
  });
}

export function ImplementersAuditTab() {
  const { hasRole } = useAuth();
  const isOwner = hasRole('platform_owner');

  const [selectedScopes, setSelectedScopes] = useState<AuditScope[]>(DEFAULT_SCOPES);
  const [sinceKey, setSinceKey] = useState<string>('30');
  const [clientId, setClientId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sinceIso = useMemo(() => {
    if (sinceKey === 'all') return null;
    const days = parseInt(sinceKey, 10);
    return new Date(Date.now() - days * 86_400_000).toISOString();
  }, [sinceKey]);

  const { data: clientsList } = useClientPicker();

  const query = useImplementersAuditLog({
    scopes: selectedScopes,
    clientId: clientId === 'all' ? null : clientId,
    sinceIso,
    page,
    pageSize,
  });

  if (!isOwner) {
    return (
      <Alert>
        <AlertDescription>Platform owner access required.</AlertDescription>
      </Alert>
    );
  }

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const profiles = query.data?.profiles;
  const clients = query.data?.clients;

  const toggleScope = (s: AuditScope) => {
    setPage(1);
    setSelectedScopes((curr) =>
      curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s],
    );
  };

  const toggleExpand = (id: string) => {
    setExpanded((curr) => {
      const n = new Set(curr);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Read-only record of implementer role changes, client assignments, and test
          email sends. All emails are masked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SCOPE_LABELS) as AuditScope[]).map((s) => {
              const active = selectedScopes.includes(s);
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => toggleScope(s)}
                >
                  {SCOPE_LABELS[s]}
                </Button>
              );
            })}
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Window</div>
              <Select value={sinceKey} onValueChange={(v) => { setSinceKey(v); setPage(1); }}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SINCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Client</div>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setPage(1); }}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {(clientsList ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Page size</div>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v, 10)); setPage(1); }}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Error */}
        {query.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {(query.error as Error).message || 'Failed to load audit log.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-[180px]">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No audit entries match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const scope = reasonToScope(r.reason);
                  const targetId = extractTargetUserId(r);
                  const actor = r.actor_id ? profiles?.get(r.actor_id) : null;
                  const target = targetId ? profiles?.get(targetId) : null;
                  const client = r.client_id ? clients?.get(r.client_id) : null;
                  const isOpen = expanded.has(r.id);
                  const maskedBefore = isOpen ? maskJsonPII(r.before) : null;
                  const maskedAfter = isOpen ? maskJsonPII(r.after) : null;
                  return (
                    <Fragment key={r.id}>
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => toggleExpand(r.id)}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss')}
                        </TableCell>
                        <TableCell><ScopeBadge scope={scope} /></TableCell>
                        <TableCell className="text-sm">{profileLabel(actor)}</TableCell>
                        <TableCell className="text-sm">
                          {target ? profileLabel(target) : (scope === 'test_email_send' ? '—' : '—')}
                        </TableCell>
                        <TableCell className="text-sm">{client?.display_name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.reason ?? '—'}</TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-semibold text-muted-foreground mb-1">Before</div>
                                <pre className="bg-background border rounded p-2 overflow-auto max-h-64">
{JSON.stringify(maskedBefore, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <div className="font-semibold text-muted-foreground mb-1">After</div>
                                <pre className="bg-background border rounded p-2 overflow-auto max-h-64">
{JSON.stringify(maskedAfter, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {query.isFetching && <Loader2 className="inline h-3 w-3 animate-spin mr-2" />}
            {total} {total === 1 ? 'entry' : 'entries'}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}