/**
 * Group bulk-write skip results into a human-readable toast description.
 *
 * POLICY §111.7 — Bulk Stage Sign-off must surface *why* cells were skipped
 * (self_not_submitted, final_locked, no_prior_score, etc.) directly in the
 * toast so reviewers don't have to dig through the audit log for a one-line
 * answer. Falls back to "see audit log" when there are too many distinct
 * reasons to fit in a toast.
 */
export interface SkipEntry {
  submission_id: string;
  reason: string;
}

const REASON_LABEL: Record<string, string> = {
  not_found: 'submission missing',
  final_locked: 'already finalised (immutable)',
  self_not_submitted: 'self not submitted',
  auditor_takes_precedence: 'auditor already scored',
  row_version_conflict: 'changed by another user',
  no_prior_score: 'no prior score to inherit',
  override_requires_input: 'override row left blank',
  not_terminal_for_template:
    'workflow has stages after this one — sign-off recorded but cannot approve from here',
};

function label(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

export function summariseSkipReasons(skipped: SkipEntry[]): string | null {
  if (!skipped || skipped.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of skipped) {
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  }
  if (counts.size >= 3) {
    return `${skipped.length} skipped — see audit log`;
  }
  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${label(reason)} (${n})`);
  return `${skipped.length} skipped: ${parts.join(', ')}`;
}

/**
 * POLICY §111.7.c — Bulk Stage Sign-off toast must distinguish three
 * independent RPC counters so reviewers see what actually happened:
 *
 *   • applied  — rows where the stage column was WRITTEN
 *   • advanced — rows whose kpis.status moved forward via reconcile
 *   • skipped  — rows the RPC refused, with a reason
 *
 * Returns a structured {title, lines[]} the toast layer renders. Pure
 * function — no React, no toast lib coupling, fully unit-tested.
 */
export interface StageWriteOutcome {
  total: number;
  applied: number;
  advanced: number | null; // null when reconcile result unavailable
  skipped: SkipEntry[];
  /** POLICY §88.1 — admin overrides that re-stamped final_score on an already-approved row. */
  relocked?: number;
  /** POLICY §88.1.c — admin overrides on approved rows where stage is non-terminal (column-only update). */
  relockedNonTerminal?: number;
  /** POLICY §88.1.d — admin overrides that force-approved a NOT-yet-approved row at its terminal stage. */
  overrideApproved?: number;
}

export interface StageWriteSummary {
  title: string;
  lines: string[];
}

export function summariseStageWriteOutcome(o: StageWriteOutcome): StageWriteSummary {
  const total = Math.max(0, o.total | 0);
  const applied = Math.max(0, o.applied | 0);
  const skipped = o.skipped ?? [];
  const skippedN = skipped.length;
  const advanced = o.advanced; // may be null (reconcile unknown) or -1 (reconcile failed)
  const advancedKnown = typeof advanced === 'number' && advanced >= 0;
  const advancedN = advancedKnown ? (advanced as number) : 0;
  const relocked = Math.max(0, (o.relocked ?? 0) | 0);
  const relockedNT = Math.max(0, (o.relockedNonTerminal ?? 0) | 0);
  const overrideApproved = Math.max(0, (o.overrideApproved ?? 0) | 0);
  const processedTotal = advancedN + relocked + relockedNT + overrideApproved;
  const writtenNotAdvanced = Math.max(0, applied - advancedN - relocked - relockedNT - overrideApproved);
  const noop = Math.max(0, total - applied - skippedN);

  // Title
  let title: string;
  if (processedTotal === total && total > 0 && (relocked > 0 || relockedNT > 0 || overrideApproved > 0)) {
    // POLICY §88.1 — admin-override re-stamp path.
    const parts: string[] = [];
    if (advancedN > 0) parts.push(`${advancedN} approved`);
    if (overrideApproved > 0) parts.push(`${overrideApproved} approved by override`);
    if (relocked > 0) parts.push(`${relocked} re-stamped`);
    if (relockedNT > 0) parts.push(`${relockedNT} column-only`);
    title = `Process complete — ${total}/${total} (${parts.join(', ')})`;
  } else if (!advancedKnown && applied > 0 && skippedN === 0) {
    title = `Signed off — ${applied}/${total} written`;
  } else if (advancedN === total && total > 0) {
    title = `Signed off — ${total} advanced`;
  } else if (advancedN > 0 && advancedN < total) {
    title = `Partially signed off — ${advancedN}/${total} advanced`;
  } else if (advancedN === 0 && skippedN === total && total > 0) {
    title = `Nothing signed off — all ${total} skipped`;
  } else if (advancedN === 0 && applied > 0) {
    title = `No status change — ${applied} written, ${skippedN} skipped`;
  } else {
    title = `Nothing changed — 0/${total}`;
  }

  // Body lines
  const lines: string[] = [];
  if (advancedN > 0) lines.push(`${advancedN} advanced to next stage`);
  if (overrideApproved > 0) {
    lines.push(`${overrideApproved} approved by admin override at terminal stage (POLICY §88.1.d)`);
  }
  if (relocked > 0) {
    lines.push(`${relocked} final score${relocked === 1 ? '' : 's'} re-stamped (admin override, POLICY §88.1)`);
  }
  if (relockedNT > 0) {
    lines.push(`${relockedNT} approved row${relockedNT === 1 ? '' : 's'} updated column-only (non-terminal stage)`);
  }
  if (writtenNotAdvanced > 0) {
    lines.push(
      `${writtenNotAdvanced} written but stage unchanged (already past this stage or value unchanged)`,
    );
  }
  const skipLine = summariseSkipReasons(skipped);
  if (skipLine) lines.push(skipLine);
  if (noop > 0) lines.push(`${noop} unaccounted (no server response)`);
  if (!advancedKnown && applied > 0) {
    lines.push('Stage write recorded — workflow reconcile result unavailable');
  }

  return { title, lines };
}