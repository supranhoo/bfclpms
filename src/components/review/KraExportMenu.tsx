import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileDown, Eye, Download, Mail, FileSpreadsheet } from 'lucide-react';
import { useKraExportConfig, canAccess } from '@/hooks/useKraExportConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useToast } from '@/hooks/use-toast';
import { generateKraSheetPdf, generateKraSheetPdfBlob, generateKraSheetExcel, buildKraSheetFromKpis, type KraExportConfig as PdfConfig } from '@/lib/kraExport';
import { KraPreviewDialog } from './KraPreviewDialog';

interface KraExportMenuProps {
  kpis: any[];
  employeeProfile: {
    full_name?: string | null;
    employee_code?: string | null;
    designation?: string | null;
  };
  department: string;
  period: string;
  year: number;
}

export function KraExportMenu({ kpis, employeeProfile, department, period, year }: KraExportMenuProps) {
  const { effectiveRole } = useAuth();
  const exportConfig = useKraExportConfig();
  const { data: appSettings } = useAppSettings();
  const { toast } = useToast();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const companyName = appSettings?.organization_name || undefined;

  const pdfConfig: PdfConfig = {
    visibleColumns: exportConfig.visibleColumns.length > 0
      ? exportConfig.visibleColumns
      : ['sr', 'category', 'kra', 'kpi', 'uom', 'target', 'weightage', 'criteria', 'r5', 'r4', 'r3', 'r2', 'r1', 'r0', 'frequency', 'source'],
    showLogo: exportConfig.showLogo,
    showEmployeeDetails: exportConfig.showEmployeeDetails,
  };

  const buildData = useCallback(() => {
    return buildKraSheetFromKpis(kpis, employeeProfile, department, period, year, companyName);
  }, [kpis, employeeProfile, department, period, year, companyName]);

  const canPreview = canAccess(exportConfig.previewRoles, effectiveRole);
  const canDownload = canAccess(exportConfig.downloadRoles, effectiveRole);
  const canEmail = canAccess(exportConfig.emailRoles, effectiveRole);
  const canExcel = canAccess(exportConfig.excelRoles, effectiveRole);

  // If feature is disabled or no actions available, hide entirely
  if (!exportConfig.isEnabled || exportConfig.isLoading) return null;
  if (!canPreview && !canDownload && !canEmail && !canExcel) return null;
  if (!kpis || kpis.length === 0) return null;

  const fileName = `KRA_${(employeeProfile.full_name || 'Employee').replace(/\s+/g, '_')}_${period}_${year}.pdf`;

  const handlePreview = () => {
    const data = buildData();
    const blob = generateKraSheetPdfBlob(data, pdfConfig);
    setPreviewBlob(blob);
    setPreviewOpen(true);
  };

  const handleDownload = () => {
    const data = buildData();
    generateKraSheetPdf(data, pdfConfig);
  };

  const handleExcel = () => {
    const data = buildData();
    generateKraSheetExcel(data, pdfConfig);
  };

  const handleEmail = () => {
    toast({
      title: 'Coming Soon',
      description: 'Email KRA functionality will be available once email integration is configured.',
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">KRA Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPreview && (
            <DropdownMenuItem onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview PDF
            </DropdownMenuItem>
          )}
          {canDownload && (
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </DropdownMenuItem>
          )}
          {canExcel && (
            <DropdownMenuItem onClick={handleExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Download Excel
            </DropdownMenuItem>
          )}
          {canEmail && (
            <DropdownMenuItem onClick={handleEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Email KRA
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <KraPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pdfBlob={previewBlob}
        fileName={fileName}
      />
    </>
  );
}
