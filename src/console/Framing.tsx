/**
 * Framing a hologram without a pointer (S9 R13): zoom, turn, tilt and reset, as buttons with
 * their keys shown. Framing only moves the view of the hologram; it never senses, points or
 * fires anything (P6, P11).
 */
import { roomMotion } from '../theme/index.ts';
import { Actions, Button, Caption } from './controls.tsx';

/** What the room offers for framing the hologram in view (RoomView). */
export interface Framing {
  frameZoom(factor: number): void;
  frameOrbit(radians: number): void;
  frameTilt(radians: number): void;
  resetFraming(): void;
}

export function FramingControls({
  view,
  orbit,
}: {
  readonly view: Framing;
  /** The hologram can be turned (MAP, SHIP); FLIGHT keeps heading-up or chart-up instead. */
  readonly orbit: boolean;
}) {
  return (
    <div role="group" aria-label="Framing">
      <Caption>framing</Caption>
      <Actions>
        <Button onClick={() => view.frameZoom(roomMotion.frameZoom)} title="Key: -">
          − ZOOM OUT
        </Button>
        <Button onClick={() => view.frameZoom(1 / roomMotion.frameZoom)} title="Key: =">
          + ZOOM IN
        </Button>
        {orbit ? (
          <>
            <Button onClick={() => view.frameOrbit(-roomMotion.frameOrbit)} title="Key: ,">
              ◂ TURN
            </Button>
            <Button onClick={() => view.frameOrbit(roomMotion.frameOrbit)} title="Key: .">
              TURN ▸
            </Button>
          </>
        ) : null}
        <Button onClick={() => view.frameTilt(-roomMotion.frameTilt)} title="Key: [">
          TILT [
        </Button>
        <Button onClick={() => view.frameTilt(roomMotion.frameTilt)} title="Key: ]">
          TILT ]
        </Button>
        <Button onClick={() => view.resetFraming()} title="Key: /">
          RESET /
        </Button>
      </Actions>
      <p className="cs-note">keys: − = zoom{orbit ? ' · , . turn' : ''} · [ ] tilt · / reset</p>
    </div>
  );
}
