import { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  parseTemplateFile,
  type ParsedTemplateWorkbook,
} from '@/lib/annualReview/templateWorkbook';
import * as svc from '@/services/annualReview/annualReviewService';
import type { AnnualReviewTemplate } from '@/types/annualReview';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingTemplates: AnnualReviewTemplate[];
  onImported: () => void;
}

type DupChoice = 'rename' | 'clone' | 'cancel';

export function TemplateUploadDialog({ open, onOpenChange, existingTemplates, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedTemplateWorkbook | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dupChoice, setDupChoice] = useState<DupChoice>('rename');
  const [renameTo, setRenameTo] = useState('');

  const reset = () => {
    setFile(null); setParsed(null); setParseError(null);
    setParsing(false); setImporting(false); setDupChoice('rename'); setRenameTo('');
  };

  const handleFile = useCallback(async (f: File) => {
    setFile(f); setParsed(null); setParseError(null); setParsing(true);
    try {
      const res = await parseTemplateFile(f);
      setParsed(res);
      const dup = existingTemplates.some((t) => t.name.trim().toLowerCase() === res.template.name.trim().toLowerCase());
      if (dup) setRenameTo(`${res.template.name} (imported)`);
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }, [existingTemplates]);

  const duplicate = parsed
    ? existingTemplates.find((t) => t.name.trim().toLowerCase() === parsed.template.name.trim().toLowerCase()) ?? null
    : null;

  const canImport =
    !!parsed &&
    parsed.errors.length === 0 &&
    !parsing &&
    !importing &&
    (!duplicate || dupChoice !== 'cancel') &&
    (!duplicate || dupChoice !== 'rename' || renameTo.trim().length > 0);

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const t = parsed.template;
      if (duplicate && dupChoice === 'clone') {
        // Save as a new version off the existing template using the parsed sections.
        await svc.upsertTemplate({
          name: `${duplicate.name} (v${(duplicate.version ?? 1) + 1})`,
          description: t.description,
          is_active: false,
          sections: t.sections,
          parent_template_id: duplicate.id,
          version: (duplicate.version ?? 1) + 1,
        });
      } else {
        const name = duplicate && dupChoice === 'rename' ? renameTo.trim() : t.name;
        await svc.upsertTemplate({
          name,
          description: t.description,
          is_active: t.is_active,
          sections: t.sections,
        });
      }
      toast.success('Template imported');
      onImported();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-file">Excel file (.xlsx)</Label>
            <Input
              id="tpl-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <p className="text-xs text-muted-foreground">
              Use the exact layout from <strong>Download Format</strong>. Max 512 KB.
            </p>
          </div>

          {parsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing…
            </div>
          )}

          {parseError && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {parseError}
            </div>
          )}

          {parsed && (
            <div className="space-y-3">
              <div className="rounded border p-3 text-sm">
                <div className="font-medium">{parsed.template.name || <em className="text-muted-foreground">(no name)</em>}</div>
                {parsed.template.description && (
                  <div className="text-xs text-muted-foreground mt-1">{parsed.template.description}</div>
                )}
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Criteria: <strong className="text-foreground">{parsed.counts.criteria}</strong></span>
                  <span>Options: <strong className="text-foreground">{parsed.counts.options}</strong></span>
                  <span>System scores: <strong className="text-foreground">{parsed.counts.system}</strong></span>
                  <span>Eligibility: <strong className="text-foreground">{parsed.counts.eligibility}</strong></span>
                  <span>Self fields: <strong className="text-foreground">{parsed.counts.selfFields}</strong></span>
                  <span>Languages: <strong className="text-foreground">{parsed.counts.languages}</strong> ({parsed.counts.translations} translations)</span>
                </div>
              </div>

              {parsed.errors.length > 0 && (
                <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-medium text-destructive mb-1">
                    <AlertTriangle className="h-4 w-4" /> {parsed.errors.length} error{parsed.errors.length === 1 ? '' : 's'}
                  </div>
                  <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
                    {parsed.errors.map((e, i) => (
                      <li key={i}>• [{e.sheet}{e.row ? ` r${e.row}` : ''}] {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsed.warnings.length > 0 && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <div className="font-medium text-amber-600 mb-1">{parsed.warnings.length} warning{parsed.warnings.length === 1 ? '' : 's'}</div>
                  <ul className="text-xs space-y-0.5 max-h-32 overflow-auto">
                    {parsed.warnings.map((w, i) => (
                      <li key={i}>• [{w.sheet}{w.row ? ` r${w.row}` : ''}] {w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsed.errors.length === 0 && !duplicate && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Ready to import as a new template.
                </div>
              )}

              {duplicate && (
                <div className="rounded border p-3 text-sm space-y-2">
                  <div className="font-medium">A template named "{duplicate.name}" already exists.</div>
                  <RadioGroup value={dupChoice} onValueChange={(v) => setDupChoice(v as DupChoice)}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <RadioGroupItem value="rename" id="dup-rename" className="mt-0.5" />
                      <div className="flex-1">
                        <div>Import as a new template with a different name</div>
                        {dupChoice === 'rename' && (
                          <Input className="mt-1.5" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} placeholder="New template name" />
                        )}
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="clone" id="dup-clone" />
                      Import as a new version of the existing template
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="cancel" id="dup-cancel" />
                      Cancel import
                    </label>
                  </RadioGroup>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={!canImport}>
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}