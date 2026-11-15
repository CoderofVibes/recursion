/**
 * CREDITS: the licence, the notice and the third-party notices that ship with the game (S13),
 * and where the README credits the work and states what was verified. The files are copied
 * from public/ beside the page, so they are found under the deployment base wherever it is.
 */
import { Panel } from '../../theme/components/index.ts';
import { Columns } from '../Columns.tsx';
import { Line } from '../controls.tsx';

/** The deployment base ('./' on Pages): the notices sit beside index.html. */
const BASE = import.meta.env.BASE_URL;
const README = 'https://github.com/CoderofVibes/recursion#';

const FILES: readonly { readonly label: string; readonly file: string; readonly what: string }[] = [
  { label: 'licence', file: 'LICENSE', what: 'Apache License 2.0' },
  { label: 'notice', file: 'NOTICE', what: 'copyright and attribution' },
  {
    label: 'third parties',
    file: 'THIRD-PARTY-NOTICES.txt',
    what: 'React, Three.js and the other libraries in the build',
  },
];

/** Who and what the build owes, as the README credits them (A22: the audio is AI-generated). */
const MADE_WITH: readonly {
  readonly label: string;
  readonly who: string;
  readonly what: string;
}[] = [
  {
    label: 'development',
    who: 'Claude (Anthropic) and OpenAI Codex',
    what: 'development assistance, under the owner’s creative direction',
  },
  {
    label: 'verification',
    who: 'NASA GMAT R2026a',
    what: 'reference trajectories the simulator is tested against',
  },
  { label: 'audio', who: 'ElevenLabs', what: 'sound effects, AI-generated' },
];

export function CreditsPage() {
  return (
    <Columns>
      <Panel title="Made with">
        {MADE_WITH.map((m) => (
          <Line key={m.label} label={m.label}>
            {m.who} · {m.what}
          </Line>
        ))}
      </Panel>
      <Panel title="Credits and licences">
        {FILES.map((f) => (
          <Line key={f.file} label={f.label}>
            <a className="cs-link" href={`${BASE}${f.file}`} target="_blank" rel="noopener">
              {f.file}
            </a>{' '}
            · {f.what}
          </Line>
        ))}
        <Line label="credits">
          <a
            className="cs-link"
            href={`${README}credits-and-licence`}
            target="_blank"
            rel="noopener"
          >
            README · credits and licence
          </a>
        </Line>
        <Line label="verified">
          <a className="cs-link" href={`${README}what-we-verified`} target="_blank" rel="noopener">
            README · what we verified
          </a>
        </Line>
        <p className="cs-note">each opens in a new tab; the game keeps running here</p>
      </Panel>
    </Columns>
  );
}
