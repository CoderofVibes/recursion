# Handoff: AU — Basic audio

Thread: GPT/Codex · Branch: `p3/au-audio` · Date (Pacific): 2026-11-15

## Delivered

- `docs/audio/cues.md` gives the owner 18 ready-to-paste ElevenLabs prompts, exact MP3 names, durations and the intended triggers. First checkpoint: `a085877`.
- `src/audio/` contains the Web Audio mixer, the opening and live-room bridge, and the volume and availability APIs. The bridge takes the snapshots already built by the room. Playback follows room time, while the game retains ownership of warp and alerts.
- `src/app/App.tsx` contains the single R24 mount. `public/audio/` is ready for the owner's MP3s.

## How to verify

- `npm run check` passed with 1,356 tests, one skipped, and the separate speed test passed. `npm run build` passed with its existing chunk warnings. Serve the result with `npm run preview`. NIGHT's driver in `docs/handoffs/night/judge-run/do.mjs` can play the production build with real keys and clicks.
- On a fresh page, press Space during the opening to enable audio. The scheduled alarms and title play as their cues arrive. In the Well Garden, go to FLIGHT, click ENTER WELL GARDEN, and hold W for the engine or Q for RCS. Use M to toggle the shared mute. Advance a coast at warp and resume warp after any precursor caution to reach the loss and wake.

## Claims, labelled

- [DEMONSTRATED: NIGHT driver, production build] The Well Garden opened in FLIGHT with zero MP3 requests and no browser issues with no files installed.
- [DEMONSTRATED: NIGHT driver, production build with temporary MP3 tones] The build served from a subdirectory. The opening made zero audio requests before the gesture, then created one audio context. Sixteen clips decoded, the absent clip was never requested, and an invalid MP3 caused no page error. Instrumented Web Audio started the room bed, rumble, three separate alarm beats, failure, cut, title and wake in order. The room bed returned at the wake.
- [DEMONSTRATED: NIGHT driver, production build with temporary MP3 tones] Well Garden button clicks, W and Q started the console, main engine and RCS clips. Both propulsion loops stopped when their inputs were released. M changed master gain from 0.65 to 0 and back. Well precursors played the caution and well hum alongside the game's existing drop to 1×.
- [DEMONSTRATED: NIGHT driver, production build with temporary MP3 tones] A Well Garden coast reached a fatal loss and restarted. Web Audio played failure, the cut to black, the Black Box pip and the wake in order. The room hum stopped under black and returned when the new attempt faded in.

## Open questions and uncertainty

- The owner still needs to generate, install and audition the ElevenLabs exports. The temporary tones exercised playback and failure handling. Evaluate the production balance and loop seams with the real files.
- The Well Garden bed uses visible precursors and the optical funnel data when supplied by VX (R50). The Cathedral texture depends on the reported A24 radiation caution (R37). The Earth reveal cue is prepared for 4D's H02; the three submission regions do not contain that sequence.
- The lighter bar used the browser smoke above. S15's modest-laptop timing gate with the final assets is outstanding.

## Requests outside my ownership

- **R25, owner:** generate the files from `docs/audio/cues.md` into `public/audio/` and rebuild. A partial set is usable.
- **R24, 3F via the integrator:** gate the existing sound switch on `soundAvailable()` from `src/audio/index.ts`. The switch and M key use the existing `src/app/sound.ts` preference. For a player-facing master level, `src/audio/index.ts` provides `soundVolume()`, `setSoundVolume(value)` for 0–1 and `onSoundVolume(listener)`.
- **3F:** preserve the live room's `.cr-black[data-stage]` loss stage and `.cr` root, or relay replacements for the audio seam before changing them. **4D:** when H02 is built, mark the same loss overlay with `data-homecoming` throughout the homeward loss and fade. Audio then shares the loss through black and uses the Earth wake variation at the fade.

## Notes for the next phase

- **Credit ElevenLabs for the generated sound effects** in game and README credits, the submission and the AI-use disclosure (A22, S12, S13). The owner generates the final audio assets.
