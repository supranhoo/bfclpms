import { Badge } from '@/components/ui/badge';
import {
  CALIBRATION_BUCKET_LABEL,
  CALIBRATION_BUCKET_TONE,
  calibrationBucket,
  daysUntilExpiry,
} from '@/lib/safetyAssets';

/**
 * Compact badge for the calibration urgency bucket of an asset row.
 * Shows nothing for assets that don't require calibration.
 */
export function AssetCalibrationBadge({
  asset,
}: {
  asset: { calibration_required: boolean; calibration_expires_at: string | null };
}) {
  if (!asset.calibration_required) {
    return (
      <Badge variant="outline" className="text-[10px]">
        N/A
      </Badge>
    );
  }
  const bucket = calibrationBucket(asset);
  const days = daysUntilExpiry(asset.calibration_expires_at);
  const suffix =
    bucket === 'overdue' && days !== null
      ? ` · ${Math.abs(days)}d`
      : bucket === 't7' && days !== null
        ? ` · ${days}d`
        : '';
  return (
    <Badge variant={CALIBRATION_BUCKET_TONE[bucket]} className="text-[11px]">
      {CALIBRATION_BUCKET_LABEL[bucket]}
      {suffix}
    </Badge>
  );
}