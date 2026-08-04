import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  buildDevReportRows,
  type CaptureFile,
  type DevReportCaptureRow,
} from '../src/lib/devReport/capture';

/**
 * ADR-246 — bundles genuine repo artefacts (migrations, ADRs, CHANGELOG) into a
 * virtual module so the Development Report can sync itself from the app,
 * without shipping ~1000 raw SQL files to the client.
 */
const VIRTUAL_ID = 'virtual:dev-report-capture';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

function readDir(root: string, rel: string, ext: string): CaptureFile[] {
  const dir = path.resolve(root, rel);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => ({ file: f, body: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export function collectDevReportRows(root: string): DevReportCaptureRow[] {
  const changelogPath = path.resolve(root, 'CHANGELOG_2026.md');
  return buildDevReportRows({
    migrations: readDir(root, 'supabase/migrations', '.sql'),
    adrs: readDir(root, 'docs/adr', '.md'),
    changelog: fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '',
  });
}

export function devReportCapturePlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'dev-report-capture',
    configResolved(cfg) {
      root = cfg.root || process.cwd();
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const rows = collectDevReportRows(root);
      return `export const rows = ${JSON.stringify(rows)};
export const capturedAt = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
export default rows;`;
    },
  };
}