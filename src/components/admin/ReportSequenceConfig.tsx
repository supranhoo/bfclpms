import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Save } from 'lucide-react';
import { useCustomReports } from '@/hooks/useCustomReports';
import { useReportDisplayOrder } from '@/hooks/useReportColumnOverrides';

interface ReportItem {
  key: string;
  label: string;
  isCustom: boolean;
}

const PREBUILT_REPORTS: ReportItem[] = [
  { key: 'employee-summary', label: 'Employee Performance Summary', isCustom: false },
  { key: 'performance', label: 'Performance Report', isCustom: false },
  { key: 'monthly-scorecard', label: 'Monthly Scorecard', isCustom: false },
  { key: 'kra-issuance', label: 'KRA Issuance Report', isCustom: false },
  { key: 'queries', label: 'Query Report', isCustom: false },
  { key: 'issues', label: 'Unified Issues Report', isCustom: false },
  { key: 'completion', label: 'Completion Rate Report', isCustom: false },
  { key: 'department', label: 'Department Summary', isCustom: false },
  { key: 'audit-trail', label: 'Audit Trail Report', isCustom: false },
  { key: 'tni', label: 'Training Needs (TNI)', isCustom: false },
  { key: 'kpi-detail', label: 'KPI Detail Report', isCustom: false },
  { key: 'kpi-mapping', label: 'KPI Mapping Matrix', isCustom: false },
  { key: 'bottleneck', label: 'Workflow Bottleneck Report', isCustom: false },
  { key: 'kpi-status-tracker', label: 'KPI Status Tracker', isCustom: false },
  { key: 'kpi-journey', label: 'KPI Journey Timeline', isCustom: false },
  { key: 'variance', label: 'Variance Report', isCustom: false },
  { key: 'manager-team-kpi', label: 'Same KPI — Manager vs Team', isCustom: false },
  { key: 'team-vs-manager-score', label: 'Team Vs Manager Monthly Score', isCustom: false },
  { key: 'kpi-scorecard-detail', label: 'KPI Scorecard Detail', isCustom: false },
  { key: 'kpi-employee-matrix', label: 'KPI-Employee Score Matrix', isCustom: false },
];

export function ReportSequenceConfig() {
  const { data: customReports = [] } = useCustomReports();
  const { order: savedOrder, saveOrder, isSaving } = useReportDisplayOrder();

  const customItems: ReportItem[] = customReports.map(r => ({
    key: `custom_${r.id}`,
    label: r.name,
    isCustom: true,
  }));

  const allReports = [...PREBUILT_REPORTS, ...customItems];

  // Build ordered list from saved order
  const buildOrderedList = useCallback((): ReportItem[] => {
    if (!savedOrder) return allReports;

    const ordered: ReportItem[] = [];
    const reportMap = new Map(allReports.map(r => [r.key, r]));

    for (const key of savedOrder) {
      const item = reportMap.get(key);
      if (item) {
        ordered.push(item);
        reportMap.delete(key);
      }
    }
    // Add any not in saved order at the end
    for (const item of reportMap.values()) {
      ordered.push(item);
    }
    return ordered;
  }, [savedOrder, allReports]);

  const [items, setItems] = useState<ReportItem[]>(buildOrderedList);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newItems = [...items];
    const [dragged] = newItems.splice(dragIndex, 1);
    newItems.splice(index, 0, dragged);
    setItems(newItems);
    setDragIndex(index);
  };

  const handleDragEnd = () => setDragIndex(null);

  const handleSave = () => {
    saveOrder(items.map(i => i.key));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Report Display Order</CardTitle>
        <CardDescription>Drag to reorder how reports appear in the Reports Hub. Changes apply to all users.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.key}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-3 p-2.5 rounded-md border bg-card cursor-grab active:cursor-grabbing transition-all ${
              dragIndex === index ? 'opacity-50 border-primary' : 'hover:bg-muted/50'
            }`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">{item.label}</span>
            <Badge variant={item.isCustom ? 'default' : 'outline'} className="text-xs">
              {item.isCustom ? 'Custom' : 'Built-in'}
            </Badge>
            <span className="text-xs text-muted-foreground">#{index + 1}</span>
          </div>
        ))}

        <div className="flex justify-end pt-3">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Order'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
