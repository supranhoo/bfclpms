import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTransientChunkError } from "./index.ts";

// Phase 9.2.c — RCA of 2026-06-11 scheduled-backup failure.
// Three back-to-back batches died with HTTP 502 Bad Gateway and were
// classified non-transient, losing 12 tables and tripping hard-fail.
// The classifier must now treat upstream gateway transients as retryable
// while preserving the existing 546 / 429 / RateLimit branches and still
// rejecting genuinely non-transient errors.

Deno.test("classifier — keeps existing transient classes (I9 regression lock)", () => {
  assert(isTransientChunkError("HTTP 546"));
  assert(isTransientChunkError("HTTP 429"));
  assert(isTransientChunkError("RateLimitError: trace abc retry after 500ms"));
  assert(isTransientChunkError("anything", true));
});

Deno.test("classifier — upstream gateway 5xx + 408 are transient (new)", () => {
  assert(isTransientChunkError("Batch failed: HTTP 502 Bad Gateway"));
  assert(isTransientChunkError("Batch failed: HTTP 503 Service Unavailable"));
  assert(isTransientChunkError("Batch failed: HTTP 504 Gateway Timeout"));
  assert(isTransientChunkError("Batch failed: HTTP 408 Request Timeout"));
});

Deno.test("classifier — network-layer errors are transient (new)", () => {
  assert(isTransientChunkError("TypeError: fetch failed"));
  assert(isTransientChunkError("Error: ECONNRESET"));
  assert(isTransientChunkError("Error: ETIMEDOUT"));
  assert(isTransientChunkError("socket hang up"));
});

Deno.test("classifier — still rejects schema / permission / non-retryable 5xx", () => {
  assertEquals(isTransientChunkError("HTTP 500 Internal Server Error"), false);
  assertEquals(isTransientChunkError("HTTP 501 Not Implemented"), false);
  assertEquals(isTransientChunkError("permission denied for table x"), false);
  assertEquals(isTransientChunkError('relation "x" does not exist'), false);
  assertEquals(isTransientChunkError("new row violates row-level security policy"), false);
  assertEquals(isTransientChunkError(undefined), false);
  assertEquals(isTransientChunkError(""), false);
});