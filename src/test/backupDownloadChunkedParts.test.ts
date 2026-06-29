import { describe, it, expect, vi, beforeEach } from 'vitest';

// ADR-101 — Chunked backup download must iterate manifest.files[] (not just .file).

type DownloadResult = { data: Blob | null; error: Error | null };

const downloadMock = vi.fn<(path: string) => Promise<DownloadResult>>();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({ download: (path: string) => downloadMock(path) }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { useDownloadBackup } from '@/hooks/useBackups';

function jsonBlob(value: unknown): Blob {
  const str = JSON.stringify(value);
  // jsdom's Blob may lack .text() — provide a shim that the hook can await.
  return { text: async () => str } as unknown as Blob;
}

async function runMutation(filePath: string) {
  // Pull the mutationFn out of the hook config by invoking it as a plain function.
  // useDownloadBackup returns useMutation(...) — we replicate by instantiating
  // and reading its options. Simpler: re-import internal mutationFn via the
  // hook factory.
  const hook = useDownloadBackup as unknown as () => { mutateAsync: (p: string) => Promise<{ blob: Blob; fileName: string }> };
  // The hook depends on React; instead drive its mutationFn directly through
  // a thin re-export pattern: we re-import the module and call its internals.
  // Fallback: rebuild the same logic path here by calling the mutationFn via
  // a minimal QueryClient wrapper.
  throw new Error('unused');
}

// The hook itself uses React Query. For a pure unit test we reach into the
// behaviour by emulating the same mutationFn the hook builds. The function
// has no React-only dependencies, so we invoke it through a small harness:
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  downloadMock.mockReset();
  // jsdom doesn't implement these — stub for onSuccess side effects.
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:test';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});

// Capture the JSON payload by spying on Blob construction so we don't depend
// on jsdom's Blob.text() implementation.
function captureBlobText(): { text: () => string } {
  const orig = globalThis.Blob;
  let captured = '';
  class CapturingBlob {
    constructor(parts: BlobPart[]) {
      captured = parts.map((p) => (typeof p === 'string' ? p : '')).join('');
    }
    get size() { return captured.length; }
    type = 'application/json';
  }
  (globalThis as unknown as { Blob: unknown }).Blob = CapturingBlob;
  return {
    text: () => {
      (globalThis as unknown as { Blob: unknown }).Blob = orig;
      return captured;
    },
  };
}

describe('useDownloadBackup — chunked manifest with multiple parts', () => {
  it('downloads every part listed in entry.files and concatenates rows', async () => {
    const manifestPath = 'auto/2026-06-29/manifest.json';
    const manifest = {
      created_at: '2026-06-29T00:00:00Z',
      tables: [
        {
          table: 't1',
          rows: 8000,
          file: 'auto/2026-06-29/t1.part-000001.json',
          files: [
            'auto/2026-06-29/t1.part-000001.json',
            'auto/2026-06-29/t1.part-000002.json',
          ],
        },
      ],
    };
    const part1 = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
    const part2 = Array.from({ length: 3000 }, (_, i) => ({ id: 5000 + i }));

    downloadMock.mockImplementation(async (path: string) => {
      if (path === manifestPath) return { data: jsonBlob(manifest), error: null };
      if (path === manifest.tables[0].files![0]) return { data: jsonBlob(part1), error: null };
      if (path === manifest.tables[0].files![1]) return { data: jsonBlob(part2), error: null };
      return { data: null, error: new Error(`unexpected path ${path}`) };
    });

    const { result } = renderHook(() => useDownloadBackup(), { wrapper });
    const out = await result.current.mutateAsync(manifestPath);
    const merged = JSON.parse(await new Response(out.blob).text()) as { data: Record<string, unknown[]> };

    expect(merged.data.t1).toHaveLength(8000);
    expect(downloadMock).toHaveBeenCalledWith(manifest.tables[0].files![0]);
    expect(downloadMock).toHaveBeenCalledWith(manifest.tables[0].files![1]);
  });

  it('falls back to entry.file when files[] is absent (legacy chunked backup)', async () => {
    const manifestPath = 'auto/legacy/manifest.json';
    const manifest = {
      tables: [{ table: 't1', rows: 3, file: 'auto/legacy/t1.json' }],
    };
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];

    downloadMock.mockImplementation(async (path: string) => {
      if (path === manifestPath) return { data: jsonBlob(manifest), error: null };
      if (path === 'auto/legacy/t1.json') return { data: jsonBlob(rows), error: null };
      return { data: null, error: new Error(`unexpected path ${path}`) };
    });

    const { result } = renderHook(() => useDownloadBackup(), { wrapper });
    const out = await result.current.mutateAsync(manifestPath);
    const merged = JSON.parse(await new Response(out.blob).text()) as { data: Record<string, unknown[]> };

    expect(merged.data.t1).toEqual(rows);
  });
});

// Suppress unused helper warning.
void runMutation;