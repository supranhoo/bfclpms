import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// v2.66.11.18 (POLICY §125.1) — `useBulkEmployeeWorkflows` must chunk inputs
// so PostgREST's 1000-row server cap can never silently drop employee
// workflow entries. Prior single-shot RPC call hid every employee past id
// #1000 from reviewer-stage filters (e.g. employee 200079 / Siddharth
// Kumar Sharma vanished from HR PMS Reviewed cards even though the tile
// counted his KPIs via score signatures).

const hookSrc = fs.readFileSync(
  path.resolve(__dirname, '../hooks/useWorkflowConfig.ts'),
  'utf8',
);

describe('useBulkEmployeeWorkflows: source-level chunking guard', () => {
  it('hook source chunks employee_ids before calling the RPC', () => {
    // Either via the dedicated chunked loop or fetchAllRpcPaged.
    const hasChunkLoop = /for\s*\([^)]*employeeIds\.length[^)]*\+=\s*\d+/.test(hookSrc);
    const hasPagedHelper = /fetchAllRpcPaged/.test(hookSrc);
    expect(hasChunkLoop || hasPagedHelper).toBe(true);
  });

  it('hook source no longer issues a single unchunked RPC for employee_ids', () => {
    // The legacy pattern was `rpc('get_bulk_employee_workflows', params)` with
    // params built from the full `employeeIds` array. The fixed hook either
    // wraps that call inside a chunk loop or passes a slice. Assert that the
    // single bare call against the full array does not survive — we check by
    // requiring `slice(` near the rpc call (the chunk extractor).
    const rpcWindow = hookSrc.match(
      /rpc\(\s*['"]get_bulk_employee_workflows['"][\s\S]{0,400}/,
    );
    expect(rpcWindow, 'rpc call must still exist').toBeTruthy();
    // The 400 chars BEFORE the rpc call must mention either slice() (chunk
    // extraction) or fetchAllRpcPaged.
    const before = hookSrc.slice(
      Math.max(0, hookSrc.indexOf("rpc('get_bulk_employee_workflows'") - 400),
      hookSrc.indexOf("rpc('get_bulk_employee_workflows'") + 400,
    );
    expect(/slice\(|fetchAllRpcPaged/.test(before)).toBe(true);
  });
});

describe('useBulkEmployeeWorkflows: multi-chunk merge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('merges results from multiple chunked RPC calls into a single map', async () => {
    // Generate 1200 unique uuids — forces ≥ 3 chunks at 500/batch.
    const ids = Array.from({ length: 1200 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );

    let callCount = 0;
    const rpc = vi.fn(async (_name: string, params: { employee_ids: string[] }) => {
      callCount++;
      return {
        data: params.employee_ids.map(id => ({
          employee_id: id,
          stages: ['kra_set', 'self_review', 'hr_pms_review', 'approved'],
        })),
        error: null,
      };
    });

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { rpc },
    }));
    vi.doMock('@tanstack/react-query', () => ({
      useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => ({
        data: undefined,
        _queryFn: queryFn,
      }),
    }));

    const { useBulkEmployeeWorkflows } = await import('../hooks/useWorkflowConfig');
    // The mocked useQuery returns the unevaluated queryFn so we can run it
    // synchronously and assert on the merged map.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (useBulkEmployeeWorkflows as any)(ids) as { _queryFn: () => Promise<Map<string, string[]>> };
    const map = await result._queryFn();

    // Every id must be present — the cap must not have truncated any chunk.
    expect(map.size).toBe(1200);
    expect(map.has(ids[0])).toBe(true);
    expect(map.has(ids[1199])).toBe(true);
    // ≥ 3 RPC calls (1200 / 500 = 3 chunks).
    expect(callCount).toBeGreaterThanOrEqual(3);
  });
});