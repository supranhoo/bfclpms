import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useWorkflowResolution, type ResolutionRow } from '@/hooks/useWorkflowResolution';
import {
  CHAIN_STAGES,
  CHAIN_STAGE_LABEL,
  NA_REASON_LABEL,
  type ChainStage,
} from '@/lib/workflowResolver';
import { useProfiles } from '@/hooks/useOrganization';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const WFR_DEFAULT_FIELDS = [
  { field_key: 'employee',   default_label: 'Employee',   default_sort: 10, is_required: true },
  { field_key: 'department', default_label: 'Department', default_sort: 20 },
  { field_key: 'template',   default_label: 'Template',   default_sort: 30 },
  { field_key: 'source',     default_label: 'Source',     default_sort: 40 },
] as const;

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function defaultPeriod(): { period: string; year: number } {
  const now = new Date();
  return { period: MONTHS[now.getMonth()], year: now.getFullYear() };
}

function StageCell({ row, stage }: { row: ResolutionRow; stage: ChainStage }) {
  const s = row.stages[stage];
  if (!s.inTemplate) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        N/A — {NA_REASON_LABEL.stage_not_in_template}
      </Badge>
    );
  }
  if (s.naReason) {
    return (
      <Badge variant="destructive" className="text-xs">
        N/A — {NA_REASON_LABEL[s.naReason]}
      </Badge>
    );
  }
  if (s.users.length === 1) {
    return <span className="text-sm">{s.users[0].full_name || s.users[0].email}</span>;
  }
  return (
    <span className="text-sm" title={s.users.map(u => u.full_name || u.email).join(', ')}>
      {s.users[0].full_name || s.users[0].email}
      <Badge variant="secondary" className="ml-1 text-[10px]">+{s.users.length - 1}</Badge>
    </span>
  );
}

function exportToExcel(rows: ResolutionRow[], period: string, year: number, deptName: (id: string | null) => string) {
  const data = rows.map(r => {
    const cell = (st: ChainStage) => {
      const s = r.stages[st];
      if (!s.inTemplate) return 'N/A — Stage not in template';
      if (s.naReason) return `N/A — ${NA_REASON_LABEL[s.naReason]}`;
      return s.users.map(u => u.full_name || u.email).join('; ');
    };
    const base: Record<string, string> = {
      'Employee Code': r.employee.employee_code || '—',
      'Employee Name': r.employee.full_name || r.employee.email,
      'Department': deptName(r.employee.department_id),
      'PMS Grade': r.employee.pms_grade || '—',
      'Resolved Template': r.templateName || '—',
      'Source': r.source,
    };
    for (const st of CHAIN_STAGES) {
      base[CHAIN_STAGE_LABEL[st]] = cell(st);
    }
    base['Has N/A'] = r.hasAnyNa ? 'Yes' : 'No';
    return base;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [`Workflow Resolution Report — ${period} ${year}`],
    [`Generated: ${new Date().toLocaleString()} | Employees: ${rows.length}`],
    [],
  ]);
  XLSX.utils.sheet_add_json(ws, data, { origin: 'A4' });
  ws['!cols'] = [
    { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 12 },
    ...CHAIN_STAGES.map(() => ({ wch: 22 })),
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Resolved Chains');
  XLSX.writeFile(wb, `Workflow_Resolution_${period}_${year}.xlsx`);
}

export default function WorkflowResolutionReport() {
  const init = defaultPeriod();
  const [period, setPeriod] = useState<string>(init.period);
  const [year, setYear] = useState<number>(init.year);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [naFilter, setNaFilter] = useState<string>('any'); // 'any' | 'na' | each stage
  const [openRow, setOpenRow] = useState<ResolutionRow | null>(null);

  const { data: profiles } = useProfiles();
  const { data: rows = [], isLoading } = useWorkflowResolution(period, year);
  const resolvedFields = useResolvedReportFields('RPT-WFR-001', WFR_DEFAULT_FIELDS);

  const departments = useMemo(() => {
    const map = new Map<string, string>();
    (profiles || []).forEach((p: any) => {
      if (p.departments?.id) map.set(p.departments.id, p.departments.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [profiles]);

  const deptName = (id: string | null) =>
    id ? departments.find(([d]) => d === id)?.[1] || '—' : '—';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (deptFilter !== 'all' && r.employee.department_id !== deptFilter) return false;
      if (q) {
        const hay = `${r.employee.full_name || ''} ${r.employee.employee_code || ''} ${r.employee.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (naFilter === 'any_na' && !r.hasAnyNa) return false;
      if (naFilter !== 'all' && naFilter !== 'any_na') {
        const stageNa = r.stages[naFilter as ChainStage]?.naReason;
        if (!stageNa) return false;
      }
      return true;
    });
  }, [rows, search, deptFilter, naFilter]);

  const yearOptions = [year - 1, year, year + 1];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workflow Resolution Report"
        description="Period-aware view of every active employee's resolved workflow template and reviewer chain. Use this to diagnose why a stage shows N/A."
        backTo="/reports"
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-6">
            <div>
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {departments.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>N/A Filter</Label>
              <Select value={naFilter} onValueChange={setNaFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  <SelectItem value="any_na">Any N/A stage</SelectItem>
                  {CHAIN_STAGES.map(s => (
                    <SelectItem key={s} value={s}>N/A in {CHAIN_STAGE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name, employee code, email"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {isLoading ? 'Loading…' : `${filtered.length} of ${rows.length} employees`}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToExcel(filtered, period, year, deptName)}
              disabled={isLoading || filtered.length === 0}
            >
              <Download className="h-4 w-4 mr-2" /> Export Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {resolvedFields.filter(f => !f.is_hidden).map(f => (
                    <TableHead key={f.field_key}>{f.label}</TableHead>
                  ))}
                  {CHAIN_STAGES.map(s => (
                    <TableHead key={s}>{CHAIN_STAGE_LABEL[s]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow
                    key={r.employee.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setOpenRow(r)}
                  >
                    {resolvedFields.filter(f => !f.is_hidden).map(f => {
                      switch (f.field_key) {
                        case 'employee':
                          return (
                            <TableCell key={f.field_key}>
                              <div className="font-medium text-sm">{r.employee.full_name || r.employee.email}</div>
                              <div className="text-xs text-muted-foreground">{r.employee.employee_code || '—'}</div>
                            </TableCell>
                          );
                        case 'department':
                          return <TableCell key={f.field_key} className="text-sm">{deptName(r.employee.department_id)}</TableCell>;
                        case 'template':
                          return <TableCell key={f.field_key} className="text-sm">{r.templateName || '—'}</TableCell>;
                        case 'source':
                          return (
                            <TableCell key={f.field_key}>
                              <Badge variant="outline" className="text-xs capitalize">{r.source}</Badge>
                            </TableCell>
                          );
                        default:
                          return <TableCell key={f.field_key} />;
                      }
                    })}
                    {CHAIN_STAGES.map(s => (
                      <TableCell key={s}><StageCell row={r} stage={s} /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={resolvedFields.filter(f => !f.is_hidden).length + CHAIN_STAGES.length} className="text-center text-sm text-muted-foreground py-8">
                      No employees match the current filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <SheetContent className="w-[420px] sm:w-[520px]">
          {openRow && (
            <>
              <SheetHeader>
                <SheetTitle>{openRow.employee.full_name || openRow.employee.email}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Resolved Template</div>
                  <div className="font-medium">{openRow.templateName || '—'} <Badge variant="outline" className="ml-1 capitalize">{openRow.source}</Badge></div>
                </div>
                <div>
                  <div className="text-muted-foreground">Template Stages</div>
                  <div className="text-xs font-mono break-all">{openRow.templateStages.join(' → ') || '—'}</div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  {CHAIN_STAGES.map(s => {
                    const stage = openRow.stages[s];
                    return (
                      <div key={s} className="flex justify-between gap-4">
                        <div className="text-muted-foreground">{CHAIN_STAGE_LABEL[s]}</div>
                        <div className="text-right">
                          {!stage.inTemplate ? (
                            <span className="text-xs text-muted-foreground">N/A — Stage not in template</span>
                          ) : stage.naReason ? (
                            <span className="text-xs text-destructive">N/A — {NA_REASON_LABEL[stage.naReason]}</span>
                          ) : (
                            <span>{stage.users.map(u => u.full_name || u.email).join(', ')}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
