export const MIN_ZOOM_PERCENT = 5;
export const MAX_ZOOM_PERCENT = 500;
export const ZOOM_STEP_PERCENT = 5;

export function snapZoomScale(scale: number): number {
  const percentage = Math.round((scale * 100) / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;
  return clampZoomPercent(percentage) / 100;
}

export function stepZoomScale(scale: number, direction: 1 | -1): number {
  const percentage = scale * 100;
  const units = percentage / ZOOM_STEP_PERCENT;
  const nearestUnit = Math.round(units);
  const isOnStep = Math.abs(units - nearestUnit) < 1e-8;
  const steppedUnit = direction > 0
    ? isOnStep ? nearestUnit + 1 : Math.ceil(units)
    : isOnStep ? nearestUnit - 1 : Math.floor(units);
  const stepped = steppedUnit * ZOOM_STEP_PERCENT;
  return clampZoomPercent(stepped) / 100;
}

function clampZoomPercent(percentage: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percentage));
}
