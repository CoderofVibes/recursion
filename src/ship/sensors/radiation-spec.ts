/** [ASSUMED: A24] Monitor electronics are included in CPU A's existing 25 kg and
 * active/standby power and heat budgets. These are gameplay instrument parameters,
 * not Curiosity RAD specifications. U = d(U s)/dt, not Gy/s or Sv/s. */
export const RADIATION_MONITOR = Object.freeze({
  host: 'flight-cpu-a',
  inputKey: 'radiation-monitor',
  stream: 'sensors.flight-cpu-a/radiation',
  channel: 'radiation.dose-rate.v1',
  responseTime: 0.25,
  sampleRate: 10,
  standbySampleRate: 1,
  /** Existing onboard channel accounting: 8-byte header + 5 values + 5 sigmas. */
  bytesPerReading: 88,
  saturationRate: 25,
  noiseFloor: 0.0005,
  relativeNoise: 0.02,
  hazardThreshold: 0.02,
  clearThreshold: 0.01,
  validity: 2,
} as const);
