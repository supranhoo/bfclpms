/**
 * ADR-252 — aggregations derived from the *qualified* training-need rows.
 *
 * The report previously read three independent server aggregates that each
 * re-queried `training_needs` with ANY-month semantics, so the cards, the
 * category table and the detail grid could disagree. Deriving every aggregate
 * from the single qualified row-set guarantees they always reconcile.
 */

export interface AggregatableNeed {
  employee_id: string;
  priority: 'high' | 'medium' | 'low';
  gap_type: string;
  status: string;
  category_id?: string | null;
  category?: { id: string; name: string } | null;
  employee?: { department_id?: string | null; department?: { id: string; name: string } | null } | null;
}

export interface TNISummaryTotals {
  total: number;
  complianceGaps: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  employeesAffected: number;
  inProgress: number;
  completed: number;
}

export function summariseNeeds(rows: AggregatableNeed[]): TNISummaryTotals {
  const employees = new Set<string>();
  let total = 0, complianceGaps = 0, high = 0, med = 0, low = 0, inProgress = 0, completed = 0;
  rows.forEach(r => {
    if (r.employee_id) employees.add(r.employee_id);
    if (r.gap_type === 'compliance') complianceGaps++;
    else {
      total++;
      if (r.priority === 'high') high++;
      else if (r.priority === 'medium') med++;
      else low++;
    }
    if (r.status === 'in_progress') inProgress++;
    if (r.status === 'completed') completed++;
  });
  return {
    total,
    complianceGaps,
    highPriority: high,
    mediumPriority: med,
    lowPriority: low,
    employeesAffected: employees.size,
    inProgress,
    completed,
  };
}

export interface CategoryAggregate {
  category_id: string | null;
  category_name: string;
  total_count: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  employees_affected: number;
}

export function aggregateByCategory(rows: AggregatableNeed[]): CategoryAggregate[] {
  const map = new Map<string, CategoryAggregate & { _emp: Set<string> }>();
  rows.forEach(r => {
    const id = r.category_id || 'uncategorized';
    if (!map.has(id)) {
      map.set(id, {
        category_id: r.category_id ?? null,
        category_name: r.category?.name || 'Uncategorized',
        total_count: 0, high_priority: 0, medium_priority: 0, low_priority: 0,
        employees_affected: 0, _emp: new Set(),
      });
    }
    const a = map.get(id)!;
    a.total_count++;
    if (r.priority === 'high') a.high_priority++;
    else if (r.priority === 'medium') a.medium_priority++;
    else a.low_priority++;
    if (r.employee_id) a._emp.add(r.employee_id);
  });
  return Array.from(map.values())
    .map(({ _emp, ...a }) => ({ ...a, employees_affected: _emp.size }))
    .sort((a, b) => b.total_count - a.total_count);
}

export interface DepartmentAggregate {
  department_id: string;
  department_name: string;
  total_needs: number;
  high_priority: number;
  employees_affected: number;
}

export function aggregateByDepartment(rows: AggregatableNeed[]): DepartmentAggregate[] {
  const map = new Map<string, DepartmentAggregate & { _emp: Set<string> }>();
  rows.forEach(r => {
    const id = r.employee?.department_id || 'unassigned';
    if (!map.has(id)) {
      map.set(id, {
        department_id: id,
        department_name: r.employee?.department?.name || 'Unassigned',
        total_needs: 0, high_priority: 0, employees_affected: 0, _emp: new Set(),
      });
    }
    const a = map.get(id)!;
    a.total_needs++;
    if (r.priority === 'high' && r.gap_type !== 'compliance') a.high_priority++;
    if (r.employee_id) a._emp.add(r.employee_id);
  });
  return Array.from(map.values())
    .map(({ _emp, ...a }) => ({ ...a, employees_affected: _emp.size }))
    .sort((a, b) => b.total_needs - a.total_needs);
}