import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, GitMerge, Info } from 'lucide-react';
import { useRegistryBrowser } from '@/hooks/useRegistryBrowser';

/**
 * Phase 3c: Read-only canonical KPI taxonomy browser for non-admin roles.
 *
 * Scope (locked by §88G):
 * - Read-only. No edit, no delete, no promote button. Admins continue to
 *   manage the registry from /admin/kpi-standardization.
 * - Shows canonical (KRA, KPI), aliases, category, and an aggregate usage
 *   count for in-scope (May 2026+) KPIs. NEVER shows employee identifiers
 *   or scores.
 * - Page-level role gate is enforced by ProtectedRoute + the
 *   `registry-browser` menu_access_config row.
 */
export default function RegistryBrowser() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');

  // Categories for the filter dropdown — small, cached separately.
  const { data: categories = [] } = useQuery({
    queryKey: ['registry-browser-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kra_categories')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading, isError } = useRegistryBrowser(
    search,
    categoryId === 'all' ? null : categoryId,
  );

  const definitions = data?.definitions ?? [];
  const totalCount = data?.total_count ?? 0;

  const aliasTotal = useMemo(
    () => definitions.reduce((sum, d) => sum + d.alias_count, 0),
    [definitions],
  );

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-4">
      <PageHeader
        title="KPI Registry Browser"
        description="Read-only view of the canonical KPI taxonomy used across the organisation."
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This page shows the standardised KPI catalogue. Each entry lists the canonical KRA / KPI
          pair plus any historical name variants ("aliases") that resolve to the same canonical KPI.
          Editing the registry is reserved for administrators.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              <CardTitle className="text-base">Search & Filter</CardTitle>
              <CardDescription className="text-xs">
                {isLoading ? 'Loading…' : (
                  <>
                    {totalCount} canonical {totalCount === 1 ? 'entry' : 'entries'}
                    {aliasTotal > 0 && ` • ${aliasTotal} alias${aliasTotal === 1 ? '' : 'es'}`}
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 lg:w-auto w-full">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search canonical KRA or KPI…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 sm:w-56">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load the registry. Please retry or contact an administrator.
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : definitions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No registry entries match the current filters.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Category</TableHead>
                    <TableHead>Canonical KRA</TableHead>
                    <TableHead>Canonical KPI</TableHead>
                    <TableHead className="w-24 text-center">Aliases</TableHead>
                    <TableHead className="w-24 text-right">In Use</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definitions.map((def) => (
                    <TableRow key={def.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {def.category_name ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {def.canonical_kra_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{def.canonical_kpi_name}</span>
                          {def.alias_count > 0 && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center" aria-label="Has alias variants">
                                    <GitMerge className="h-3 w-3 text-muted-foreground" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <p className="text-xs font-medium mb-1">Also known as</p>
                                  <ul className="text-xs text-muted-foreground space-y-0.5">
                                    {def.aliases.map((a, i) => (
                                      <li key={i}>
                                        <span className="font-medium">{a.kra_name}</span>
                                        {' / '}
                                        <span className="font-medium">{a.kpi_name}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {def.alias_count}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {def.usage_count}
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