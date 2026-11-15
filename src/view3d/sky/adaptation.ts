/** Optical exposure only. Real seconds, never simulation time or time warp. */
export function adaptedExposure(
  current: number,
  sunVisible: boolean,
  elapsedSeconds: number,
): number {
  const target = sunVisible ? 0.58 : 1;
  const dt = Math.max(0, Math.min(0.25, elapsedSeconds));
  return current + (target - current) * (1 - Math.exp(-dt / 2.4));
}
