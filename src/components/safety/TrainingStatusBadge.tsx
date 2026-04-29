import { Badge } from '@/components/ui/badge';
import {
  SAFETY_TRAINING_STATUS_LABEL,
  SAFETY_TRAINING_STATUS_TONE,
  type SafetyTrainingStatus,
} from '@/lib/safetyTraining';

/** Reusable badge keyed off the SSOT labels/tones for training status. */
export function TrainingStatusBadge({ status }: { status: SafetyTrainingStatus }) {
  return (
    <Badge variant={SAFETY_TRAINING_STATUS_TONE[status]}>
      {SAFETY_TRAINING_STATUS_LABEL[status]}
    </Badge>
  );
}