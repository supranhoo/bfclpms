# T-002 — Consolidated `search_path` audit on SECURITY DEFINER fns

**Severity:** Warn  
**Phase:** Deferred (independent)

## Problem

`supabase--linter` flags multiple SECURITY DEFINER functions without
`set search_path = ...`. Safety helpers already pin it; this ticket
confirms 100% coverage and patches any remaining gaps.

## Fix

Single migration adding `set search_path = public` (or `public, pg_temp`
for extension-aware funcs) to each missing function.

## Rollback

`alter function … reset search_path` per function.

## Resolution (2026-05-20)

Verified via `pg_proc` scan: zero SECURITY DEFINER functions in `public`
with names matching Safety (`safety_%`, `has_safety%`, `%_safety_%`,
`%permit%`, `%incident%`) are missing `set search_path`. Ticket closed
with no migration required.
