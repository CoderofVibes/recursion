/**
 * CONSOLE: the screen set into the console's top, which takes over the view when the player
 * looks down into it (DECISIONS A8). Everything that is not a hologram lives here: the mission
 * design, the plan, the predictive model, Black Box and the ship's systems.
 */
import { BlackBoxMark } from '../theme/components/index.ts';
import { TimeControls } from './controls.tsx';
import { useDesk } from './desk.ts';
import type { Desk, PageId } from './desk.ts';
import { BlackBoxPage } from './pages/BlackBoxPage.tsx';
import { CreditsPage } from './pages/CreditsPage.tsx';
import { MissionPage } from './pages/MissionPage.tsx';
import { ModelPage } from './pages/ModelPage.tsx';
import { PlanPage } from './pages/PlanPage.tsx';
import { SystemsPage } from './pages/SystemsPage.tsx';

const PAGES: readonly { id: PageId; label: string }[] = [
  { id: 'mission', label: 'MISSION' },
  { id: 'plan', label: 'PLAN' },
  { id: 'model', label: 'MODEL' },
  { id: 'blackbox', label: 'BLACK BOX' },
  { id: 'systems', label: 'SYSTEMS' },
  { id: 'credits', label: 'CREDITS' },
];

export function ConsoleScreen({
  desk,
  visible,
  onBack,
}: {
  readonly desk: Desk;
  readonly visible: boolean;
  /** Leave the console for the room (the same as Escape). */
  readonly onBack?: () => void;
}) {
  useDesk(desk);
  const { game } = desk;
  const status = game.status();
  const go = (page: PageId): void => desk.setPage(page);
  return (
    // Hidden, the screen is inert: nothing on it can be reached or pressed (S9 R9).
    <div
      className="cs-screen"
      data-on={visible ? '' : undefined}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="cs-frame">
        <nav className="cs-tabs" aria-label="Console pages">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="cs-tab"
              aria-current={desk.page === p.id ? 'page' : undefined}
              data-on={desk.page === p.id ? '' : undefined}
              data-tone={p.id === 'blackbox' ? 'blackbox' : undefined}
              data-quiet={p.id === 'credits' ? '' : undefined}
              data-flag={p.id === 'blackbox' && desk.debriefOf ? '' : undefined}
              onClick={() => go(p.id)}
            >
              {p.label}
            </button>
          ))}
          <span className="cs-tabs__name">{game.briefing.name}</span>
        </nav>
        {/* A labelled region the keyboard can reach and scroll, for long pages (S9 R14). */}
        <div
          className="cs-page"
          role="region"
          tabIndex={0}
          aria-label={PAGES.find((p) => p.id === desk.page)?.label ?? 'Console page'}
        >
          {/* Pages are mounted only while the screen is up: they read the game as they render. */}
          {visible && desk.page === 'mission' ? <MissionPage desk={desk} /> : null}
          {visible && desk.page === 'plan' ? <PlanPage desk={desk} /> : null}
          {visible && desk.page === 'model' ? <ModelPage desk={desk} /> : null}
          {visible && desk.page === 'blackbox' ? <BlackBoxPage desk={desk} /> : null}
          {visible && desk.page === 'systems' ? <SystemsPage desk={desk} /> : null}
          {visible && desk.page === 'credits' ? <CreditsPage /> : null}
        </div>
        <footer className="cs-foot">
          <TimeControls game={game} forecasts={desk.snapshot().forecasts} reason={desk.warpDrop} />
          <BlackBoxMark
            state={status.phase === 'ended' || status.paused ? 'idle' : 'recording'}
            label={`Attempt ${status.attemptIndex}`}
            detail={status.phase === 'ended' ? status.outcome.kind : status.phase}
          />
          {/* The reason warp dropped is already beside the time controls. */}
          <span className="cs-foot__note">
            {desk.warpDrop && desk.note.endsWith(desk.warpDrop) ? '' : desk.note}
          </span>
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
