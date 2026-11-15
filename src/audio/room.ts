import type { ViewSnapshot } from '../contracts/index.ts';
import type { SessionStatus } from '../game/belief/controls.ts';
import type { LossStage } from '../view3d/room/RoomView.ts';
import { loops, type Shot } from './catalogue.ts';
import type { Mixer } from './mixer.ts';

const ROOM_GAIN = 0.27;
const ALERT_GAP_MS = 850;
const ALERTS = ['caution', 'warning'] as const;
type Alert = (typeof ALERTS)[number];

export function playRoom(mixer: Mixer, encounter: string, maxMainThrust: number) {
  let previousAlertKeys: Set<string> | undefined;
  let lastAlert: Alert = 'caution';
  let lastAlertAt = -Infinity;
  let previousStage: LossStage | undefined;
  let failure = false;

  function stageSound(stage: LossStage, homecoming: boolean): Shot | undefined {
    switch (stage) {
      case 'start':
        mixer.stopShots();
        return failure ? 'loss-failure' : undefined;
      case 'black':
        mixer.stopShots();
        return failure ? 'black-cut' : undefined;
      case 'pip':
        return 'black-box-record';
      case 'fade':
        return homecoming ? 'home-reveal' : 'room-wake';
    }
  }

  function playAlert(status: SessionStatus): void {
    const keys = new Set<string>();
    let fresh: Alert | undefined;
    const add = (key: string, level: Alert): void => {
      const id = `${key}:${level}`;
      keys.add(id);
      if (
        previousAlertKeys &&
        !previousAlertKeys.has(id) &&
        (!fresh || ALERTS.indexOf(level) > ALERTS.indexOf(fresh))
      ) {
        fresh = level;
      }
    };

    for (const alert of status.alerts) add(alert.id, alert.level);
    for (const sighting of status.sightings) add(`sighting:${sighting.field}`, 'caution');

    previousAlertKeys = keys;
    const now = performance.now();
    if (
      fresh &&
      (now - lastAlertAt >= ALERT_GAP_MS || ALERTS.indexOf(fresh) > ALERTS.indexOf(lastAlert)) &&
      mixer.shot(fresh)
    ) {
      lastAlert = fresh;
      lastAlertAt = now;
    }
  }

  return (
    status: SessionStatus,
    snapshot: ViewSnapshot,
    overlay: HTMLElement,
    damaged: boolean,
  ): void => {
    const stage = overlay.dataset.stage as LossStage | undefined;
    if (stage) {
      if (stage !== previousStage) {
        // Recall starts at black and already has a fresh attempt. A real failure or H02 shakes.
        if (stage === 'start' || (stage === 'black' && previousStage === undefined)) {
          failure = status.outcome.kind === 'lost' || overlay.hasAttribute('data-homecoming');
        }
        const shot = stageSound(stage, overlay.hasAttribute('data-homecoming'));
        if (shot) mixer.shot(shot);
      }
      previousStage = stage;
      previousAlertKeys = undefined;
      for (const loop of loops) {
        const gain =
          loop === 'room-hum' ? (stage === 'fade' ? ROOM_GAIN : stage === 'start' ? 0.06 : 0) : 0;
        mixer.bed(loop, gain);
      }
      return;
    }
    previousStage = undefined;
    mixer.bed('room-hum', ROOM_GAIN);

    const operating = status.phase === 'operate' && !status.paused;
    if (operating) {
      playAlert(status);
      if (damaged) mixer.shot('equipment-damage');
    } else previousAlertKeys = undefined;

    let main = 0;
    let rcs = 0;
    if (operating) {
      for (const thrust of snapshot.ship.thrust) {
        if (thrust.source === 'main-engine') main += thrust.magnitude;
        else rcs += thrust.magnitude;
      }
    }
    mixer.bed('main-engine', main > 0 ? 0.12 + 0.26 * Math.min(main / maxMainThrust, 1) : 0);
    mixer.bed('rcs-thruster', rcs > 0 ? 0.14 : 0);

    let well = 0;
    if (operating && encounter === 'inverse-wells') {
      if (status.sightings.some((sighting) => sighting.kind === 'precursor')) well = 0.07;
      for (const field of snapshot.window?.fields ?? []) {
        if (field.kind === 'funnel' && field.visible) {
          well = Math.max(well, 0.19 * field.brightness);
        }
      }
    }
    mixer.bed('well-hum', well);

    const radiation = operating && status.alerts.some((alert) => alert.id === 'radiation-high');
    mixer.bed('lattice-radiation', radiation ? 0.17 : 0);
  };
}

export function openingRoomGain(gain: number): number {
  return ROOM_GAIN * gain;
}
