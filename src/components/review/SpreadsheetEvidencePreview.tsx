import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const MAX_ROWS = 200;
const MAX_COLUMNS = 50;

interface ParsedSheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}

interface SpreadsheetEvidencePreviewProps {
  blob: Blob;
  fileName: string;
}

async function parseWorkbook(blob: Blob): Promise<ParsedSheet[]> {
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array', cellDates: true });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    const maxWidth = allRows.reduce((width, row) => Math.max(width, row.length), 0);
    return {
      name,
      rows: allRows
        .slice(0, MAX_ROWS)
        .map((row) => row.slice(0, MAX_COLUMNS).map((cell) => String(cell ?? ''))),
      truncated: allRows.length > MAX_ROWS || maxWidth > MAX_COLUMNS,
    };
  });
}

export function SpreadsheetEvidencePreview({ blob, fileName }: SpreadsheetEvidencePreviewProps) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveSheet(0);
    parseWorkbook(blob)
      .then((parsed) => {
        if (!cancelled) setSheets(parsed);
      })
      .catch(() => {
        if (!cancelled) setError('This spreadsheet could not be rendered. Download it to open the full file.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const sheet = sheets[activeSheet] ?? null;
  const columnCount = useMemo(
    () => sheet?.rows.reduce((count, row) => Math.max(count, row.length), 0) ?? 0,
    [sheet],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Preparing spreadsheet…
      </div>
    );
  }

  if (error || !sheet) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{error ?? 'The workbook is empty.'}</div>;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background" aria-label={`Spreadsheet preview: ${fileName}`}>
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-2">
          {sheets.map((item, index) => (
            <Button
              key={`${item.name}-${index}`}
              type="button"
              size="sm"
              variant={index === activeSheet ? 'secondary' : 'ghost'}
              onClick={() => setActiveSheet(index)}
            >
              {item.name}
            </Button>
          ))}
        </div>
      )}
      {sheet.truncated && (
        <p className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">
          Preview limited to {MAX_ROWS} rows and {MAX_COLUMNS} columns. Download for the complete workbook.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-xs">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? 'bg-muted font-medium' : 'bg-background'}>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className="max-w-72 whitespace-pre-wrap border px-2 py-1.5 align-top text-foreground"
                  >
                    {row[columnIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const SPREADSHEET_PREVIEW_LIMITS = { rows: MAX_ROWS, columns: MAX_COLUMNS } as const;