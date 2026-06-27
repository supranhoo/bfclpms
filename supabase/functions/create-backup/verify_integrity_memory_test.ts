import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyBackupIntegrity } from "./index.ts";

// Phase 9.2.d — HTTP 546 finalize-OOM regression guard.
//
// Background: every scheduled backup from 2026-06-22 through 2026-06-26
// finalized as `failed` with "Finalize failed: HTTP 546" despite all
// batches succeeding (218 tables, ~317k rows on disk). Root cause:
// `verifyBackupIntegrity` downloaded every per-table JSON and JSON.parse'd
// it just to read `parsed.length`, blowing past the 256 MB Deno Deploy
// worker cap. The fix verifies presence + size via `storage.list` and
// trusts the batch-reported row count.
//
// These tests pin the memory-safe contract: any PR that re-introduces a
// `download(...)` call inside the verifier fails CI immediately.

type Listed = { name: string; metadata?: { size: number } };

function makeMockClient(opts: {
  listed: Listed[];
  onDownload: () => void;
}) {
  return {
    storage: {
      from(_bucket: string) {
        return {
          // Single page returned; verifier paginates but stops on short page.
          async list(_path: string, _o?: { limit?: number; offset?: number }) {
            return { data: opts.listed, error: null };
          },
          async download(_path: string) {
            opts.onDownload();
            throw new Error(
              "verifyBackupIntegrity must NOT call storage.download (HTTP 546 regression guard — see DOCUMENTATION.md WP-9.2.d)",
            );
          },
        };
      },
    },
  };
}

const folder = "chunked/2026-06-27T00-00-00";

function manifestEntry(table: string, rows: number) {
  const file = `${folder}/${table}.json`;
  return { table, rows, file, files: [file] };
}

Deno.test("verifyBackupIntegrity — happy path never downloads files", async () => {
  const tables = Array.from({ length: 218 }, (_, i) => manifestEntry(`t_${i}`, 100 + i));
  const listed: Listed[] = tables.map((t) => ({
    name: `${t.table}.json`,
    metadata: { size: 1024 * (i_for(t.rows)) },
  }));
  let downloadCalls = 0;
  const mock = makeMockClient({ listed, onDownload: () => downloadCalls++ });

  // deno-lint-ignore no-explicit-any
  const report = await verifyBackupIntegrity(mock as any, folder, tables);

  assertEquals(downloadCalls, 0, "must not download any per-table file");
  assertEquals(report.status, "ok");
  assertEquals(report.missing.length, 0);
  assertEquals(report.unreadable.length, 0);
  assertEquals(report.row_mismatch.length, 0);
  assertEquals(report.verified_tables, tables.length);
});

Deno.test("verifyBackupIntegrity — flags missing parts without downloading", async () => {
  const tables = [manifestEntry("a", 10), manifestEntry("b", 20), manifestEntry("c", 30)];
  const listed: Listed[] = [
    { name: "a.json", metadata: { size: 100 } },
    // b.json deliberately missing
    { name: "c.json", metadata: { size: 300 } },
  ];
  let downloadCalls = 0;
  const mock = makeMockClient({ listed, onDownload: () => downloadCalls++ });

  // deno-lint-ignore no-explicit-any
  const report = await verifyBackupIntegrity(mock as any, folder, tables);

  assertEquals(downloadCalls, 0);
  assertEquals(report.status, "failed");
  assert(report.missing.includes("b:b.json"), `expected b:b.json in missing, got ${JSON.stringify(report.missing)}`);
});

Deno.test("verifyBackupIntegrity — flags zero-byte parts as unreadable, no download", async () => {
  const tables = [manifestEntry("a", 10), manifestEntry("b", 20)];
  const listed: Listed[] = [
    { name: "a.json", metadata: { size: 100 } },
    { name: "b.json", metadata: { size: 0 } },
  ];
  let downloadCalls = 0;
  const mock = makeMockClient({ listed, onDownload: () => downloadCalls++ });

  // deno-lint-ignore no-explicit-any
  const report = await verifyBackupIntegrity(mock as any, folder, tables);

  assertEquals(downloadCalls, 0);
  assertEquals(report.status, "failed");
  assert(
    report.unreadable.some((u) => u.table === "b" && u.reason.includes("zero-byte")),
    `expected zero-byte unreadable for b, got ${JSON.stringify(report.unreadable)}`,
  );
});

// Tiny helper kept local — avoids importing test utils from the function bundle.
function i_for(n: number): number {
  // arbitrary non-zero size derived from row count; sizes don't affect the
  // happy-path assertion, only that they are > 0.
  return Math.max(1, n);
}