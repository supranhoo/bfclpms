import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface KpiDefinition {
  categoryId: string;
  categoryName: string;
  kraName: string;
  kpiName: string;
}

interface ParsedRow {
  category: string;
  kra: string;
  kpiName: string;
  achievedValue: number | null;
  remark: string;
  matched: boolean;
  matchedDef?: KpiDefinition;
  error?: string;
}

interface OrgKpiBulkImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiDefinitions: KpiDefinition[];
  onImport: (values: Array<{
    category_id: string;
    kra_name: string;
    kpi_name: string;
    achieved_value: number | null;
    remarks?: string;
  }>) => Promise<void>;
}

export function OrgKpiBulkImport({ open, onOpenChange, kpiDefinitions, onImport }: OrgKpiBulkImportProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        const rows: ParsedRow[] = jsonData.map(row => {
          const category = String(row['Category'] || '').trim();
          const kra = String(row['KRA'] || '').trim();
          const kpiName = String(row['KPI Name'] || '').trim();
          const rawAchieved = row['Achieved Value'];
          const remark = String(row['Remark'] || '').trim();

          // Match against definitions
          const matchedDef = kpiDefinitions.find(d =>
            d.categoryName.toLowerCase() === category.toLowerCase() &&
            d.kraName.toLowerCase() === kra.toLowerCase() &&
            d.kpiName.toLowerCase() === kpiName.toLowerCase()
          );

          let achievedValue: number | null = null;
          let error: string | undefined;

          if (rawAchieved !== undefined && rawAchieved !== '' && rawAchieved !== null) {
            const parsed = parseFloat(String(rawAchieved));
            if (isNaN(parsed)) {
              error = 'Invalid number';
            } else {
              achievedValue = parsed;
            }
          }

          if (!matchedDef) {
            error = error || 'KPI not found';
          }

          return {
            category,
            kra,
            kpiName,
            achievedValue,
            remark,
            matched: !!matchedDef && !error,
            matchedDef,
            error,
          };
        });

        setParsedRows(rows);
      } catch (err) {
        toast({ title: 'Failed to parse file', description: 'Please use the exported template format', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validRows = parsedRows.filter(r => r.matched && r.matchedDef);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      await onImport(
        validRows.map(r => ({
          category_id: r.matchedDef!.categoryId,
          kra_name: r.matchedDef!.kraName,
          kpi_name: r.matchedDef!.kpiName,
          achieved_value: r.achievedValue,
          remarks: r.remark || undefined,
        }))
      );
      toast({ title: `${validRows.length} KPI values imported` });
      setParsedRows([]);
      setFileName('');
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setParsedRows([]);
    setFileName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import Org KPI Data from Excel
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with the exported template format. Only matching KPIs will be imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {parsedRows.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 border-2 border-dashed rounded-lg">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload an Excel file (.xlsx)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{fileName}</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="default">{validRows.length} valid</Badge>
                  {parsedRows.length - validRows.length > 0 && (
                    <Badge variant="destructive">{parsedRows.length - validRows.length} errors</Badge>
                  )}
                </div>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs">KRA</TableHead>
                      <TableHead className="text-xs">KPI</TableHead>
                      <TableHead className="text-xs text-center">Achieved</TableHead>
                      <TableHead className="text-xs">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-2">
                          {row.matched ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-2">{row.category}</TableCell>
                        <TableCell className="text-xs py-2">{row.kra}</TableCell>
                        <TableCell className="text-xs py-2">{row.kpiName}</TableCell>
                        <TableCell className="text-xs text-center py-2">{row.achievedValue ?? '—'}</TableCell>
                        <TableCell className="text-xs py-2 text-destructive">{row.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {parsedRows.length > 0 && (
            <Button onClick={handleImport} disabled={validRows.length === 0 || isImporting}>
              {isImporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
              ) : (
                `Import ${validRows.length} KPIs`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
