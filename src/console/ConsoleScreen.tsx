/**
 * CONSOLE: the screen set into the console's top, which takes over the view when the player
 * looks down into it (DECISIONS A8). Everything that is not a hologram lives here.
 *
 * Its spine is the loop (A26): EXPLORATION, SYSTEMS, PLAN, FLIGHT, BLACK BOX, MODEL, in that
 * order across the top, each with one line saying where it stands, so a judge can see what has
 * been done and what comes next. Five are pages here; FLIGHT is the hologram's own view, and
 * its stage goes there. Each page leads with one instrument: the chart of the region, the
 * power the ship is set to draw, the forecast of the plan, what was flown against what was
 * forecast, the evidence against the law.
 */
import type { ReactNode } from 'react';
import { BlackBoxMark } from '../theme/components/index.ts';
import { TimeControls } from './controls.tsx';
import { useDesk } from './desk.ts';
import type { Desk, PageId } from './desk.ts';
import { LoopRail } from './instruments/LoopRail.tsx';
import { BlackBoxPage } from './pages/BlackBoxPage.tsx';
import { CreditsPage } from './pages/CreditsPage.tsx';
import { ExplorationPage } from './pages/ExplorationPage.tsx';
import { ModelPage } from './pages/ModelPage.tsx';
import { PlanPage } from './pages/PlanPage.tsx';
import { SystemsPage } from './pages/SystemsPage.tsx';
import { STAGE_LABEL, deskStages } from './stages.ts';

/** Go to a stage of the loop: a page here, or (FLIGHT) the hologram's view. */
export function goStage(desk: Desk, id: string, onFlight?: () => void): void {
  if (id === 'flight') onFlight?.();
  else desk.setPage(id as PageId);
}

export function ConsoleScreen({
  desk,
  visible,
  onBack,
  onFlight,
  footerExtra,
}: {
  readonly desk: Desk;
  readonly visible: boolean;
  /** Leave the console for the room (the same as Escape). */
  readonly onBack?: () => void;
  /** Go to the FLIGHT view: the loop's fourth stage is the hologram, not a page. */
  readonly onFlight?: () => void;
  /** More in the footer beside the way back (the sound switch). */
  readonly footerExtra?: ReactNode;
}) {
  useDesk(desk);
  const { game } = desk;
  const status = game.status();
  const label = desk.page === 'credits' ? 'CREDITS' : STAGE_LABEL[desk.page];
  return (
    // Hidden, the screen is inert: nothing on it can be reached or pressed (S9 R9).
    <div
      className="cs-screen"
      data-on={visible ? '' : undefined}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="cs-frame">
        {/* The loop, in order: the stages are worked out only while the screen is up. */}
        {visible ? (
          <LoopRail
            stages={deskStages(desk)}
            current={desk.page}
            onGo={(id) => goStage(desk, id, onFlight)}
            label="The loop: console pages"
          />
        ) : null}
        {/* A labelled region the keyboard can reach and scroll, for long pages (S9 R14). */}
        <div className="cs-page" role="region" tabIndex={0} aria-label={label}>
          {/* Pages are mounted only while the screen is up: they read the game as they render. */}
          {visible && desk.page === 'exploration' ? <ExplorationPage desk={desk} /> : null}
          {visible && desk.page === 'systems' ? <SystemsPage desk={desk} /> : null}
          {visible && desk.page === 'plan' ? <PlanPage desk={desk} /> : null}
          {visible && desk.page === 'blackbox' ? <BlackBoxPage desk={desk} /> : null}
          {visible && desk.page === 'model' ? <ModelPage desk={desk} /> : null}
          {visible && desk.page === 'credits' ? <CreditsPage /> : null}
        </div>
        <footer className="cs-foot">
          <TimeControls
            game={game}
            forecasts={desk.snapshot().forecasts}
            reason={desk.warpDrop}
            onEnter={() => desk.enter()}
          />
          <BlackBoxMark
            state={status.phase === 'ended' || status.paused ? 'idle' : 'recording'}
            label={`Attempt ${status.attemptIndex}`}
            detail={status.phase === 'ended' ? status.outcome.kind : status.phase}
          />
          {/* The reason warp dropped is already beside the time controls. */}
          <span className="cs-foot__note">
            {desk.warpDrop && desk.note.endsWith(desk.warpDrop) ? '' : desk.note}
          </span>
          {/* Credits: there to be found, not asking to be. */}
          <button
            type="button"
            className="cs-foot__back"
            aria-current={desk.page === 'credits' ? 'page' : undefined}
            onClick={() => desk.setPage(desk.page === 'credits' ? 'exploration' : 'credits')}
          >
            CREDITS
          </button>
          {footerExtra}
          {onBack ? (
            <button type="button" className="cs-foot__back" onClick={onBack}>
              ESC ▸ STEP BACK
            </button>
          ) : (
            <span className="cs-foot__back">ESC ▸ STEP BACK</span>
          )}
        </footer>
      </div>
    </div>
  );
}
