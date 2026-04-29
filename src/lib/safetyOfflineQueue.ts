/**
 * Phase 1.E — Safety Offline Queue (IndexedDB)
 * --------------------------------------------
 * Persists incident submissions that failed to reach the server (no network,
 * fetch error, 5xx). Each entry is keyed by `client_submission_id` so the DB
 * UNIQUE(reporter_id, client_submission_id) constraint guarantees server-side
 * dedup on retry.
 *
 * Design choices:
 *  - Native IndexedDB (no `idb`/`dexie` dep added — keeps bundle small).
 *  - Stores File/Blob objects directly (IDB supports them natively).
 *  - Single object store; no migrations beyond the `version=1` schema.
 *  - All public functions are Promise-based; never throw uncaught.
 */

import type { ReportIncidentInput } from '@/hooks/useSafetyIncidents';

const DB_NAME = 'safety_offline_v1';
const STORE = 'pending_incidents';
const VERSION = 1;

export interface PendingIncidentFile {
  name: string;
  type: string;
  size: number;
  blob: Blob;
}

export interface PendingIncident {
  /** UUID — also the client_submission_id sent to the server (idempotent). */
  id: string;
  reporter_id: string;
  payload: ReportIncidentInput;
  files: PendingIncidentFile[];
  created_at: number; // epoch ms
  attempts: number;
  last_error?: string | null;
  last_attempt_at?: number | null;
}

function isIDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIDBAvailable()) {
      reject(new Error('IndexedDB unavailable in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_created', 'created_at');
        store.createIndex('by_reporter', 'reporter_id');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Insert (or replace, idempotent) a pending submission. */
export async function enqueuePendingIncident(
  entry: Omit<PendingIncident, 'attempts' | 'last_error' | 'last_attempt_at'>,
): Promise<void> {
  if (!isIDBAvailable()) throw new Error('Offline queue not supported in this browser');
  const db = await openDb();
  try {
    const full: PendingIncident = {
      ...entry,
      attempts: 0,
      last_error: null,
      last_attempt_at: null,
    };
    await asPromise(tx(db, 'readwrite').put(full));
  } finally {
    db.close();
  }
}

export async function listPendingIncidents(): Promise<PendingIncident[]> {
  if (!isIDBAvailable()) return [];
  const db = await openDb();
  try {
    const all = await asPromise(tx(db, 'readonly').getAll());
    return ((all as PendingIncident[]) ?? []).sort(
      (a, b) => a.created_at - b.created_at,
    );
  } finally {
    db.close();
  }
}

export async function countPendingIncidents(): Promise<number> {
  if (!isIDBAvailable()) return 0;
  const db = await openDb();
  try {
    return await asPromise(tx(db, 'readonly').count());
  } finally {
    db.close();
  }
}

export async function deletePendingIncident(id: string): Promise<void> {
  if (!isIDBAvailable()) return;
  const db = await openDb();
  try {
    await asPromise(tx(db, 'readwrite').delete(id));
  } finally {
    db.close();
  }
}

export async function recordPendingFailure(
  id: string,
  error: string,
): Promise<void> {
  if (!isIDBAvailable()) return;
  const db = await openDb();
  try {
    const existing = (await asPromise(tx(db, 'readonly').get(id))) as
      | PendingIncident
      | undefined;
    if (!existing) return;
    existing.attempts += 1;
    existing.last_error = error.slice(0, 500);
    existing.last_attempt_at = Date.now();
    await asPromise(tx(db, 'readwrite').put(existing));
  } finally {
    db.close();
  }
}

/**
 * Drop entries that have failed too many times AND are older than `maxAgeMs`.
 * Lets us self-heal a poisoned queue without surprising the user.
 * Default: 10 attempts AND 7 days old → discard.
 */
export async function pruneStalePending(
  maxAttempts = 10,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  if (!isIDBAvailable()) return 0;
  const items = await listPendingIncidents();
  const cutoff = Date.now() - maxAgeMs;
  let dropped = 0;
  for (const it of items) {
    if (it.attempts >= maxAttempts && it.created_at < cutoff) {
      await deletePendingIncident(it.id);
      dropped += 1;
    }
  }
  return dropped;
}