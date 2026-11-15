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

export function CreditsPage() {
  return (
    <Columns>
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
        <Line label="verification">
          <a className="cs-link" href={`${README}what-we-verified`} target="_blank" rel="noopener">
            README · what we verified
          </a>
        </Line>
        <p className="cs-note">each opens in a new tab; the game keeps running here</p>
      </Panel>
    </Columns>
  );
}
