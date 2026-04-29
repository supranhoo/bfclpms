import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, Upload, FileText, Shield, Lock, GripVertical, Download, ChevronLeft, ChevronRight, ImageDown } from 'lucide-react';
import { useSystemSetting, useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { Skeleton } from '@/components/ui/skeleton';

// --- Helpers ---
function parseSetting<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw.replace(/^"|"$/g, '')) as T; } catch { /* ignore */ }
    // try unwrapping double-encoded JSON
    const stripped = String(raw).replace(/^"|"$/g, '');
    try { return JSON.parse(stripped) as T; } catch { /* ignore */ }
    return stripped as unknown as T;
  }
  return raw as T;
}

function parseNumber(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'number') return raw;
  const n = parseFloat(String(raw).replace(/^"|"$/g, ''));
  return isNaN(n) ? fallback : n;
}

function parseBool(raw: unknown, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).replace(/^"|"$/g, '').toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return fallback;
}

// --- Constants ---
const EVIDENCE_TYPE_OPTIONS = [
  { label: 'PDF', value: 'pdf' },
  { label: 'DOC/DOCX', value: 'doc,docx' },
  { label: 'XLS/XLSX', value: 'xls,xlsx' },
  { label: 'PNG', value: 'png' },
  { label: 'JPG/JPEG', value: 'jpg,jpeg' },
  { label: 'PPT/PPTX', value: 'ppt,pptx' },
];

const IMPORT_TYPE_OPTIONS = [
  { label: 'XLSX', value: 'xlsx' },
  { label: 'XLS', value: 'xls' },
  { label: 'CSV', value: 'csv' },
];

const KPI_MANDATORY_OPTIONS = [
  { key: 'target', label: 'Target' },
  { key: 'uom', label: 'UOM' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'weightage', label: 'Weightage' },
  { key: 'criteria', label: 'Criteria' },
  { key: 'thresholds', label: 'R5–R0 Thresholds' },
  { key: 'sourceOfData', label: 'Source of Data' },
  { key: 'division', label: 'Division' },
  { key: 'department', label: 'Department' },
  { key: 'businessUnit', label: 'Business Unit' },
];

const KPI_ALWAYS_REQUIRED = ['Employee Code', 'Full Name', 'Category', 'KRA', 'KPI'];

const EMP_MANDATORY_OPTIONS = [
  { key: 'email', label: 'Email' },
  { key: 'designation', label: 'Designation' },
  { key: 'division', label: 'Division' },
  { key: 'department', label: 'Department' },
  { key: 'managerCode', label: 'Manager Code' },
  { key: 'role', label: 'Role' },
  { key: 'pmsGrade', label: 'PMS Grade' },
  { key: 'level', label: 'Level' },
];

const EMP_ALWAYS_REQUIRED = ['Employee Code', 'Full Name'];

const KPI_COLUMN_LABELS: Record<string, string> = {
  employeeCode: 'Employee Code', fullName: 'Full Name', category: 'Category',
  kra: 'KRA', kpi: 'KPI', target: 'Target', uom: 'UOM', frequency: 'Frequency',
  kpiWeightage: 'Weightage', criteria: 'Criteria', r5: 'R5', r4: 'R4', r3: 'R3',
  r2: 'R2', r1: 'R1', r0: 'R0',
};

const EMP_COLUMN_LABELS: Record<string, string> = {
  employeeCode: 'Employee Code', fullName: 'Full Name', email: 'Email',
  designation: 'Designation', division: 'Division', businessUnit: 'Business Unit',
  department: 'Department', pmsGrade: 'PMS Grade', managerEmployeeId: 'Manager Code',
  role: 'Role',
};

// --- Sub-components ---

function DraggableColumnList({ columns, labels, onChange }: {
  columns: string[];
  labels: Record<string, string>;
  onChange: (newOrder: string[]) => void;
}) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragOverItem.current = index;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...columns];
    const [removed] = items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, removed);
    dragItem.current = null;
    dragOverItem.current = null;
    onChange(items);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= columns.length) return;
    const items = [...columns];
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    onChange(items);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {columns.map((col, i) => (
        <div
          key={col}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={handleDrop}
          className="group flex items-center gap-1 border rounded-md px-2 py-1 cursor-grab active:cursor-grabbing bg-background hover:bg-muted transition-colors select-none"
        >
          <button
            type="button"
            onClick={() => moveItem(i, -1)}
            disabled={i === 0}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-primary disabled:opacity-30"
            title="Move left"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">{i + 1}.</span>
          <span className="text-sm">{labels[col] || col}</span>
          <button
            type="button"
            onClick={() => moveItem(i, 1)}
            disabled={i === columns.length - 1}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-primary disabled:opacity-30"
            title="Move right"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      ))}
      <p className="w-full text-xs text-muted-foreground mt-1">Drag badges to reorder, or use ◀▶ arrows for fine control.</p>
    </div>
  );
}


function SettingCard({ title, description, icon, children, onSave, saving, dirty }: {
  title: string; description: string; icon: React.ReactNode; children: React.ReactNode;
  onSave: () => void; saving: boolean; dirty: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="flex justify-end border-t pt-4">
          <Button onClick={onSave} disabled={!dirty || saving} className="gap-2" size="sm">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Check if a type group is active (e.g. "doc,docx" → check if doc OR docx in list)
function isTypeGroupActive(group: string, active: string[]) {
  return group.split(',').some(t => active.includes(t));
}

function toggleTypeGroup(group: string, active: string[], checked: boolean): string[] {
  const parts = group.split(',');
  if (checked) {
    return [...new Set([...active, ...parts])];
  }
  return active.filter(t => !parts.includes(t));
}

// --- Main Component ---

export function UploadSettingsTab() {
  const updateSetting = useUpdateSystemSetting();

  // Fetch all settings
  const { data: evidenceMaxData, isLoading: l1 } = useSystemSetting('evidence_max_size_mb');
  const { data: importMaxData, isLoading: l2 } = useSystemSetting('import_max_size_mb');
  const { data: brandingMaxData, isLoading: l3 } = useSystemSetting('branding_max_size_mb');
  const { data: evidenceTypesData, isLoading: l4 } = useSystemSetting('evidence_allowed_types');
  const { data: importTypesData, isLoading: l5 } = useSystemSetting('import_allowed_types');
  const { data: maxRowsData, isLoading: l6 } = useSystemSetting('import_max_rows');
  const { data: dupHandlingData, isLoading: l7 } = useSystemSetting('import_duplicate_handling');
  const { data: bgThresholdData, isLoading: l8 } = useSystemSetting('import_background_threshold');
  const { data: kpiMandData, isLoading: l9 } = useSystemSetting('kpi_import_mandatory_fields');
  const { data: empMandData, isLoading: l10 } = useSystemSetting('employee_import_mandatory_fields');
  const { data: maxFilesData, isLoading: l11 } = useSystemSetting('evidence_max_files_per_kpi');
  const { data: pasteData, isLoading: l12 } = useSystemSetting('evidence_allow_paste');
  const { data: kpiColData, isLoading: l13 } = useSystemSetting('kpi_import_column_order');
  const { data: empColData, isLoading: l14 } = useSystemSetting('employee_import_column_order');
  const { data: compEnabledData } = useSystemSetting('image_compression_enabled');
  const { data: compPolicyData } = useSystemSetting('image_compression_policy');

  const isLoading = l1||l2||l3||l4||l5||l6||l7||l8||l9||l10||l11||l12||l13||l14;

  // --- Local state ---
  const [evidenceMaxMb, setEvidenceMaxMb] = useState(5);
  const [importMaxMb, setImportMaxMb] = useState(10);
  const [brandingMaxMb, setBrandingMaxMb] = useState(5);
  const [evidenceTypes, setEvidenceTypes] = useState<string[]>([]);
  const [importTypes, setImportTypes] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState(10000);
  const [dupHandling, setDupHandling] = useState('skip');
  const [bgThreshold, setBgThreshold] = useState(100);
  const [kpiMandatory, setKpiMandatory] = useState<string[]>([]);
  const [empMandatory, setEmpMandatory] = useState<string[]>([]);
  const [maxFiles, setMaxFiles] = useState(5);
  const [allowPaste, setAllowPaste] = useState(true);
  const [kpiColumns, setKpiColumns] = useState<string[]>([]);
  const [empColumns, setEmpColumns] = useState<string[]>([]);
  const [compEnabled, setCompEnabled] = useState(true);
  const [compQuality, setCompQuality] = useState(82); // 0–100 scale

  // Dirty tracking
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const markDirty = (key: string) => setDirtyKeys(prev => new Set(prev).add(key));
  const clearDirty = (key: string) => setDirtyKeys(prev => { const n = new Set(prev); n.delete(key); return n; });

  // Sync from DB
  useEffect(() => { if (evidenceMaxData?.setting_value != null) setEvidenceMaxMb(parseNumber(evidenceMaxData.setting_value, 5)); }, [evidenceMaxData]);
  useEffect(() => { if (importMaxData?.setting_value != null) setImportMaxMb(parseNumber(importMaxData.setting_value, 10)); }, [importMaxData]);
  useEffect(() => { if (brandingMaxData?.setting_value != null) setBrandingMaxMb(parseNumber(brandingMaxData.setting_value, 5)); }, [brandingMaxData]);
  useEffect(() => { if (evidenceTypesData?.setting_value != null) setEvidenceTypes(parseSetting<string[]>(evidenceTypesData.setting_value, [])); }, [evidenceTypesData]);
  useEffect(() => { if (importTypesData?.setting_value != null) setImportTypes(parseSetting<string[]>(importTypesData.setting_value, [])); }, [importTypesData]);
  useEffect(() => { if (maxRowsData?.setting_value != null) setMaxRows(parseNumber(maxRowsData.setting_value, 10000)); }, [maxRowsData]);
  useEffect(() => { if (dupHandlingData?.setting_value != null) setDupHandling(parseSetting<string>(dupHandlingData.setting_value, 'skip')); }, [dupHandlingData]);
  useEffect(() => { if (bgThresholdData?.setting_value != null) setBgThreshold(parseNumber(bgThresholdData.setting_value, 100)); }, [bgThresholdData]);
  useEffect(() => { if (kpiMandData?.setting_value != null) setKpiMandatory(parseSetting<string[]>(kpiMandData.setting_value, [])); }, [kpiMandData]);
  useEffect(() => { if (empMandData?.setting_value != null) setEmpMandatory(parseSetting<string[]>(empMandData.setting_value, [])); }, [empMandData]);
  useEffect(() => { if (maxFilesData?.setting_value != null) setMaxFiles(parseNumber(maxFilesData.setting_value, 5)); }, [maxFilesData]);
  useEffect(() => { if (pasteData?.setting_value != null) setAllowPaste(parseBool(pasteData.setting_value, true)); }, [pasteData]);
  useEffect(() => { if (kpiColData?.setting_value != null) setKpiColumns(parseSetting<string[]>(kpiColData.setting_value, [])); }, [kpiColData]);
  useEffect(() => { if (empColData?.setting_value != null) setEmpColumns(parseSetting<string[]>(empColData.setting_value, [])); }, [empColData]);
  useEffect(() => { if (compEnabledData?.setting_value != null) setCompEnabled(parseBool(compEnabledData.setting_value, true)); }, [compEnabledData]);
  useEffect(() => {
    if (compPolicyData?.setting_value != null) {
      const p = parseSetting<{ quality?: number }>(compPolicyData.setting_value, {});
      if (typeof p?.quality === 'number') setCompQuality(Math.round(p.quality * 100));
    }
  }, [compPolicyData]);

  // --- Save handlers ---
  const saveSetting = (key: string, value: string, dirtyGroup: string) => {
    updateSetting.mutate({ key, value }, { onSuccess: () => clearDirty(dirtyGroup) });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Upload className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">Upload Settings</h2>
      </div>

      {/* 1. File Size Limits */}
      <SettingCard
        title="File Size Limits"
        description="Configure maximum file sizes for different upload categories."
        icon={<Upload className="h-5 w-5" />}
        onSave={() => {
          saveSetting('evidence_max_size_mb', String(evidenceMaxMb), 'sizes');
          saveSetting('import_max_size_mb', String(importMaxMb), 'sizes');
          saveSetting('branding_max_size_mb', String(brandingMaxMb), 'sizes');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('sizes')}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Evidence Upload', value: evidenceMaxMb, set: setEvidenceMaxMb, max: 50 },
            { label: 'Import File', value: importMaxMb, set: setImportMaxMb, max: 50 },
            { label: 'Branding Asset', value: brandingMaxMb, set: setBrandingMaxMb, max: 20 },
          ].map(({ label, value, set, max }) => (
            <div key={label} className="p-3 rounded-lg border space-y-2">
              <Label className="text-sm font-medium">{label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={max} value={value}
                  onChange={e => { set(Math.max(1, Math.min(max, Number(e.target.value)))); markDirty('sizes'); }}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">MB (1–{max})</span>
              </div>
            </div>
          ))}
        </div>
      </SettingCard>

      {/* 2. Allowed File Types */}
      <SettingCard
        title="Allowed File Types"
        description="Control which file formats are accepted for uploads."
        icon={<FileText className="h-5 w-5" />}
        onSave={() => {
          saveSetting('evidence_allowed_types', JSON.stringify(evidenceTypes), 'types');
          saveSetting('import_allowed_types', JSON.stringify(importTypes), 'types');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('types')}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Evidence Uploads</Label>
            <div className="flex flex-wrap gap-4">
              {EVIDENCE_TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={isTypeGroupActive(opt.value, evidenceTypes)}
                    onCheckedChange={(c) => { setEvidenceTypes(toggleTypeGroup(opt.value, evidenceTypes, !!c)); markDirty('types'); }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-2 block">Import Files</Label>
            <div className="flex flex-wrap gap-4">
              {IMPORT_TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={importTypes.includes(opt.value)}
                    onCheckedChange={(c) => {
                      setImportTypes(c ? [...importTypes, opt.value] : importTypes.filter(t => t !== opt.value));
                      markDirty('types');
                    }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </SettingCard>

      {/* 3. Import Validation */}
      <SettingCard
        title="Import Validation Rules"
        description="Configure limits and behavior for data imports."
        icon={<Shield className="h-5 w-5" />}
        onSave={() => {
          saveSetting('import_max_rows', String(maxRows), 'validation');
          saveSetting('import_duplicate_handling', dupHandling, 'validation');
          saveSetting('import_background_threshold', String(bgThreshold), 'validation');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('validation')}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-lg border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Max Rows Per Import</Label>
              <p className="text-xs text-muted-foreground">Maximum number of data rows allowed in a single import file.</p>
            </div>
            <Input type="number" min={100} max={100000} value={maxRows}
              onChange={e => { setMaxRows(Number(e.target.value)); markDirty('validation'); }}
              className="w-28"
            />
          </div>
          <div className="p-3 rounded-lg border space-y-3">
            <Label className="text-sm font-medium">Duplicate Handling</Label>
            <RadioGroup value={dupHandling} onValueChange={v => { setDupHandling(v); markDirty('validation'); }}
              className="flex gap-6"
            >
              {[
                { value: 'skip', label: 'Skip Duplicates' },
                { value: 'update', label: 'Update Existing' },
                { value: 'reject', label: 'Reject File' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value={opt.value} />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="flex items-center gap-4 p-3 rounded-lg border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Background Import Threshold</Label>
              <p className="text-xs text-muted-foreground">Imports with more rows than this will process in the background.</p>
            </div>
            <Input type="number" min={10} max={10000} value={bgThreshold}
              onChange={e => { setBgThreshold(Number(e.target.value)); markDirty('validation'); }}
              className="w-28"
            />
          </div>
        </div>
      </SettingCard>

      {/* 4. Mandatory Fields */}
      <SettingCard
        title="Mandatory Import Fields"
        description="Configure which fields are required during KPI and Employee imports."
        icon={<Lock className="h-5 w-5" />}
        onSave={() => {
          saveSetting('kpi_import_mandatory_fields', JSON.stringify(kpiMandatory), 'mandatory');
          saveSetting('employee_import_mandatory_fields', JSON.stringify(empMandatory), 'mandatory');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('mandatory')}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">KPI Import</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {KPI_ALWAYS_REQUIRED.map(f => (
                <Badge key={f} variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />{f}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {KPI_MANDATORY_OPTIONS.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={kpiMandatory.includes(opt.key)}
                    onCheckedChange={(c) => {
                      setKpiMandatory(c ? [...kpiMandatory, opt.key] : kpiMandatory.filter(k => k !== opt.key));
                      markDirty('mandatory');
                    }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold mb-2 block">Employee Import</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {EMP_ALWAYS_REQUIRED.map(f => (
                <Badge key={f} variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />{f}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {EMP_MANDATORY_OPTIONS.map(opt => (
                <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={empMandatory.includes(opt.key)}
                    onCheckedChange={(c) => {
                      setEmpMandatory(c ? [...empMandatory, opt.key] : empMandatory.filter(k => k !== opt.key));
                      markDirty('mandatory');
                    }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </SettingCard>

      {/* 5. Evidence Upload Rules */}
      <SettingCard
        title="Evidence Upload Rules"
        description="Control evidence file upload behavior for KPIs."
        icon={<Upload className="h-5 w-5" />}
        onSave={() => {
          saveSetting('evidence_max_files_per_kpi', String(maxFiles), 'evidence');
          saveSetting('evidence_allow_paste', String(allowPaste), 'evidence');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('evidence')}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 rounded-lg border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Max Files Per KPI</Label>
              <p className="text-xs text-muted-foreground">Maximum number of evidence files that can be attached to a single KPI.</p>
            </div>
            <Input type="number" min={1} max={20} value={maxFiles}
              onChange={e => { setMaxFiles(Math.max(1, Math.min(20, Number(e.target.value)))); markDirty('evidence'); }}
              className="w-20"
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="text-sm font-medium">Allow Paste Upload (Ctrl+V)</Label>
              <p className="text-xs text-muted-foreground">Enable clipboard paste to upload screenshots and images.</p>
            </div>
            <Switch checked={allowPaste} onCheckedChange={c => { setAllowPaste(c); markDirty('evidence'); }} />
          </div>
        </div>
      </SettingCard>

      {/* 6. Import Column Sequence */}
      <SettingCard
        title="Import Column Sequence"
        description="Configure the expected column order for import templates. Drag to reorder."
        icon={<GripVertical className="h-5 w-5" />}
        onSave={() => {
          saveSetting('kpi_import_column_order', JSON.stringify(kpiColumns), 'columns');
          saveSetting('employee_import_column_order', JSON.stringify(empColumns), 'columns');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('columns')}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">KPI Import Template</Label>
            <DraggableColumnList
              columns={kpiColumns}
              labels={KPI_COLUMN_LABELS}
              onChange={(cols) => { setKpiColumns(cols); markDirty('columns'); }}
            />
          </div>
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold mb-2 block">Employee Import Template</Label>
            <DraggableColumnList
              columns={empColumns}
              labels={EMP_COLUMN_LABELS}
              onChange={(cols) => { setEmpColumns(cols); markDirty('columns'); }}
            />
          </div>
        </div>
      </SettingCard>

      {/* Image Compression (Phase A) */}
      <SettingCard
        title="Image Compression"
        description="Automatically shrink large evidence photos before upload. Visually lossless, runs in a background worker, and never blocks the form. Skipped for non-images, files under 300 KB, animated GIFs, and PNGs with transparency."
        icon={<ImageDown className="h-5 w-5" />}
        onSave={() => {
          saveSetting('image_compression_enabled', String(compEnabled), 'compression');
          const policy = {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 2560,
            quality: Math.min(0.95, Math.max(0.6, compQuality / 100)),
            severeQuality: 0.92,
          };
          saveSetting('image_compression_policy', JSON.stringify(policy), 'compression');
        }}
        saving={updateSetting.isPending}
        dirty={dirtyKeys.has('compression')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto-compress images on upload</Label>
              <p className="text-xs text-muted-foreground">
                Applies to Safety incident evidence and PMS review evidence. High and critical Safety severity automatically use a higher quality preset.
              </p>
            </div>
            <Switch
              checked={compEnabled}
              onCheckedChange={(c) => { setCompEnabled(c); markDirty('compression'); }}
            />
          </div>
          <div className="p-3 rounded-lg border space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Quality target</Label>
              <Badge variant="outline">{compQuality}</Badge>
            </div>
            <Input
              type="range" min={60} max={95} step={1} value={compQuality}
              onChange={(e) => { setCompQuality(Number(e.target.value)); markDirty('compression'); }}
              disabled={!compEnabled}
            />
            <p className="text-xs text-muted-foreground">
              60 = aggressive savings, 95 = near-original quality. Default 82 is visually lossless for evidence photos.
            </p>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}
