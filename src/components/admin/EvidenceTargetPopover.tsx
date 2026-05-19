import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, X } from 'lucide-react';
import type { OrgKpiEvidenceTargetingRow } from '@/hooks/useOrgKpiEvidenceFiles';

interface Props {
  employeeIds: string[];
  departmentIds: string[];
  mappedRows: OrgKpiEvidenceTargetingRow[];
  onChange: (next: { employeeIds: string[]; departmentIds: string[] }) => void;
  disabled?: boolean;
}

/**
 * Compact "Applies to" control per evidence file.
 * Empty selection = applies to everyone in the KPI's mapped scope (default).
 * Otherwise, the file is delivered only to selected employees + members of selected departments.
 */
export function EvidenceTargetPopover({
  employeeIds, departmentIds, mappedRows, onChange, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emp' | 'dept'>('emp');
  const [q, setQ] = useState('');

  const allEmployees = useMemo(() => mappedRows.map(r => ({
    id: r.employee_id, name: r.employee_name, dept: r.department_name,
  })), [mappedRows]);

  const allDepts = useMemo(() => {
    const m = new Map<string, string>();
    mappedRows.forEach(r => { if (r.department_id) m.set(r.department_id, r.department_name); });
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [mappedRows]);

  const totalMapped = allEmployees.length;
  const hasTarget = employeeIds.length + departmentIds.length > 0;

  const effectiveCount = useMemo(() => {
    if (!hasTarget) return totalMapped;
    const empSet = new Set(employeeIds);
    const deptSet = new Set(departmentIds);
    return allEmployees.filter(e => empSet.has(e.id) || mappedRows.find(r => r.employee_id === e.id && r.department_id && deptSet.has(r.department_id))).length;
  }, [hasTarget, employeeIds, departmentIds, allEmployees, mappedRows, totalMapped]);

  const filteredEmps = useMemo(() => {
    const qq = q.toLowerCase();
    return allEmployees.filter(e => !qq || e.name.toLowerCase().includes(qq) || e.dept.toLowerCase().includes(qq));
  }, [allEmployees, q]);

  const filteredDepts = useMemo(() => {
    const qq = q.toLowerCase();
    return allDepts.filter(d => !qq || d.name.toLowerCase().includes(qq));
  }, [allDepts, q]);

  const toggleEmp = (id: string) => {
    const next = employeeIds.includes(id) ? employeeIds.filter(x => x !== id) : [...employeeIds, id];
    onChange({ employeeIds: next, departmentIds });
  };
  const toggleDept = (id: string) => {
    const next = departmentIds.includes(id) ? departmentIds.filter(x => x !== id) : [...departmentIds, id];
    onChange({ employeeIds, departmentIds: next });
  };
  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ employeeIds: [], departmentIds: [] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="h-7 text-[11px] gap-1 px-2">
          <Users className="h-3 w-3" />
          {hasTarget
            ? <>Targeted: <strong>{effectiveCount}</strong>/{totalMapped}</>
            : <>All employees ({totalMapped})</>}
          {hasTarget && (
            <span
              role="button"
              onClick={clearAll}
              className="ml-1 inline-flex items-center hover:text-destructive"
              aria-label="Clear targeting"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex border-b">
          <button
            type="button"
            className={`flex-1 text-xs py-2 ${tab === 'emp' ? 'border-b-2 border-primary font-semibold' : 'text-muted-foreground'}`}
            onClick={() => setTab('emp')}
          >
            Employees ({employeeIds.length})
          </button>
          <button
            type="button"
            className={`flex-1 text-xs py-2 ${tab === 'dept' ? 'border-b-2 border-primary font-semibold' : 'text-muted-foreground'}`}
            onClick={() => setTab('dept')}
          >
            Departments ({departmentIds.length})
          </button>
        </div>
        <div className="p-2">
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={tab === 'emp' ? 'Search employees…' : 'Search departments…'}
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-y-auto px-2 pb-2">
          {tab === 'emp' ? (
            filteredEmps.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4">No mapped employees</p>
            ) : filteredEmps.map(e => (
              <label key={e.id} className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={employeeIds.includes(e.id)} onCheckedChange={() => toggleEmp(e.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-tight truncate">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{e.dept}</p>
                </div>
              </label>
            ))
          ) : (
            filteredDepts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4">No departments in scope</p>
            ) : filteredDepts.map(d => (
              <label key={d.id} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={departmentIds.includes(d.id)} onCheckedChange={() => toggleDept(d.id)} />
                <span className="text-xs truncate">{d.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="border-t p-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {hasTarget ? `Reaches ${effectiveCount} of ${totalMapped}` : `All ${totalMapped} mapped employees`}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange({ employeeIds: [], departmentIds: [] })}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface DistributionPreviewProps {
  rows: OrgKpiEvidenceTargetingRow[];
  isLoading?: boolean;
}

/**
 * Read-only "who-gets-what" matrix shown below the file list in the Evidence Manager Sheet.
 * Directly answers: "Which supporting is attached with which employee?"
 */
export function DistributionPreview({ rows, isLoading }: DistributionPreviewProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 6);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-2">Loading distribution…</p>;
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No mapped employees yet.</p>;
  }

  const driftBadge = (kind: OrgKpiEvidenceTargetingRow['drift_kind']) => {
    const map: Record<string, { label: string; cls: string }> = {
      in_sync:        { label: 'In sync',     cls: 'border-emerald-300 text-emerald-700 bg-emerald-50' },
      not_propagated: { label: 'Not pushed',  cls: 'border-slate-300 text-slate-600 bg-slate-50' },
      missing_files:  { label: 'Missing',     cls: 'border-amber-300 text-amber-700 bg-amber-50' },
      extra_files:    { label: 'Extra',       cls: 'border-blue-300 text-blue-700 bg-blue-50' },
      mismatch:       { label: 'Mismatch',    cls: 'border-rose-300 text-rose-700 bg-rose-50' },
    };
    const v = map[kind] ?? map.mismatch;
    return <Badge variant="outline" className={`text-[10px] ${v.cls}`}>{v.label}</Badge>;
  };

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1.5">Employee</th>
            <th className="text-left px-2 py-1.5">Dept</th>
            <th className="text-left px-2 py-1.5">Files (expected)</th>
            <th className="text-left px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(r => (
            <tr key={r.kpi_id} className="border-t">
              <td className="px-2 py-1.5 truncate max-w-[140px]">{r.employee_name}</td>
              <td className="px-2 py-1.5 truncate max-w-[100px] text-muted-foreground">{r.department_name}</td>
              <td className="px-2 py-1.5">
                {r.expected_files.length === 0
                  ? <span className="text-muted-foreground">—</span>
                  : (
                    <div className="flex flex-wrap gap-1">
                      {r.expected_files.slice(0, 3).map((f, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-normal max-w-[120px] truncate">
                          {f.label || 'file'}
                        </Badge>
                      ))}
                      {r.expected_files.length > 3 && (
                        <Badge variant="secondary" className="text-[10px]">+{r.expected_files.length - 3}</Badge>
                      )}
                    </div>
                  )}
              </td>
              <td className="px-2 py-1.5">{driftBadge(r.drift_kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 6 && (
        <div className="bg-muted/20 border-t px-2 py-1.5 text-center">
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Show less' : `Show ${rows.length - 6} more`}
          </Button>
        </div>
      )}
    </div>
  );
}
