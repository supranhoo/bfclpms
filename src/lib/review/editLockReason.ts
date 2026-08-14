/**
 * ADR-258 / POLICY §REVIEW-EDIT-LOCK-REASON — an edit lock must always state
 * its reason.
 *
 * The self-review surface derives "read only" and "cannot submit" from several
 * independent inputs (period governance, KPI stage, org-level data ownership,
 * frequency cycle, form completeness). Historically the UI showed only a
 * "Read Only" badge or a greyed Submit button with no cause, which made every
 * field report ("employee says fields are read-only") impossible to triage
 * without a database session.
 *
 * These two pure resolvers turn the gate inputs into ONE plain-language cause,
 * in a fixed precedence order. They are the single source of truth for the
 * sheet, the tablet entry surface and the regression tests.
 */

export interface EditLockInputs {
  /** Governance says the period is view-only or self-submit is not allowed. */
  governanceLocked: boolean;
  /** KPI has moved past the employee-editable stages (kra_set / self_review). */
  pastSelfStage: boolean;
  /** Human label for the current stage, used in the past-stage message. */
  stageLabel?: string | null;
  /** Org-level KPI whose value is owned by someone else. */
  orgLocked: boolean;
  /** Names of the assigned org data owners, if known. */
  orgOwnerNames?: string[];
}

export type EditLockReason = {
  code: 'governance' | 'past_stage' | 'org_owned';
  message: string;
} | null;

/**
 * Precedence: governance (period-wide) → stage → org ownership.
 * Returns null when the KPI is editable.
 */
export function resolveEditLockReason(input: EditLockInputs): EditLockReason {
  if (input.governanceLocked) {
    return {
      code: 'governance',
      message:
        'This review period is locked by the administrator, so entries cannot be edited right now.',
    };
  }

  if (input.pastSelfStage) {
    const stage = input.stageLabel?.trim();
    return {
      code: 'past_stage',
      message: stage
        ? `This KPI has already moved to ${stage}. It can no longer be edited at the self-review stage.`
        : 'This KPI has already moved past your self-review stage and can no longer be edited.',
    };
  }

  if (input.orgLocked) {
    const owners = (input.orgOwnerNames ?? []).filter(Boolean);
    return {
      code: 'org_owned',
      message: owners.length
        ? `This is an organization-level KPI. Its value is entered by ${owners.join(', ')}.`
        : 'This is an organization-level KPI. Its value is entered by the assigned data owner.',
    };
  }

  return null;
}

export interface SubmitBlockInputs {
  /** Multi-month frequency: sibling month locked or cycle not finished. */
  multiMonthBlocked: boolean;
  /** Daily / Weekly KPI that needs a sub-period selection. */
  needsSubPeriod: boolean;
  subPeriodSelected: boolean;
  /** Achieved value present in the form. */
  hasAchievedValue: boolean;
  isNa: boolean;
  /** Trimmed length of the self remarks (N/A requires a 50-char justification). */
  remarksLength: number;
  /** Remarks are mandatory for self review by workflow settings. */
  remarksMandatory?: boolean;
  saving: boolean;
}

/**
 * Returns the reason the Submit button is disabled, or null when it is enabled.
 * The order mirrors the disabled expression in SelfReviewSheet so the tooltip
 * can never disagree with the button state.
 */
export function resolveSubmitBlockReason(input: SubmitBlockInputs): string | null {
  if (input.saving) return 'Saving your entry…';

  if (input.multiMonthBlocked) {
    return 'This KPI belongs to a multi-month cycle that has not finished yet. It becomes submittable in the final month of the cycle.';
  }

  if (input.needsSubPeriod && !input.subPeriodSelected) {
    return 'Select the day or week you are entering data for.';
  }

  if (!input.isNa && !input.hasAchievedValue) {
    return 'Enter your achieved value before submitting.';
  }

  if (input.isNa && input.remarksLength < 50) {
    return `Marking a KPI as N/A needs a justification of at least 50 characters (${input.remarksLength} so far).`;
  }

  if (!input.isNa && input.remarksMandatory && input.remarksLength === 0) {
    return 'Remarks are required for self review.';
  }

  return null;
}
