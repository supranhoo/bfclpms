import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface ScopedRow {
  scopeId: string; // departmentId or employeeId
  scopeName: string;
  scopeSubText?: string; // e.g. comma-separated employee names under a department
  achievedValue: number | null;
  remarks: string;
  evidenceUrl: string | null;
}

interface OrgKpiScopedEntryTableProps {
  rows: ScopedRow[];
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl', value: string | null) => void;
  scopeLabel: string; // "Department" or "Employee"
}

export function OrgKpiScopedEntryTable({ rows, onValueChange, scopeLabel }: OrgKpiScopedEntryTableProps) {
  const [isOpen, setIsOpen] = useState(false);

  const enteredCount = rows.filter(r => r.achievedValue !== null).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sm">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {rows.length} {scopeLabel}s ({enteredCount} entered)
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg mt-2 min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs">{scopeLabel}</TableHead>
                <TableHead className="text-xs w-32 text-center">Achieved</TableHead>
                <TableHead className="text-xs w-44">Remark</TableHead>
                <TableHead className="text-xs w-24">File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.scopeId}>
                  <TableCell className="text-sm py-2">
                    <div className="flex flex-col">
                      <span>{row.scopeName}</span>
                      {row.scopeSubText && (
                        <span className="text-xs text-muted-foreground">{row.scopeSubText}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      type="number"
                      value={row.achievedValue ?? ''}
                      onChange={(e) => onValueChange(row.scopeId, 'achievedValue', e.target.value)}
                      placeholder="—"
                      className="h-8 text-center text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <Input
                      value={row.remarks}
                      onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
                      placeholder="Remark"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <OrgKpiFileUpload
                      existingUrl={row.evidenceUrl}
                      onUploadComplete={(url) => onValueChange(row.scopeId, 'evidenceUrl', url)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
