# The trailer's sound: cue sheet

The owner generates every file in ElevenLabs (A22). The trailer page (`src/trailer/`) schedules each sound on the timeline with Web Audio, locked to the picture, so Game Bar records both in one take. **A missing file plays as silence**, so a partial set works and each file can be auditioned as it lands: reload the page and press Space.

Two sets of files:

- **The game's cues, reused** (ledger R56), so the video sounds like the game and there are fewer files to make. Generate them from AU's prompts in [`docs/audio/cues.md`](../audio/cues.md) into `public/audio/`, with AU's file names. Each one serves the game and the video.
- **The trailer's own cues**, below. Save them as MP3 into `src/trailer/audio/` with exactly these names.

Mix: aim each export to peak around −3 dBFS. The page's master runs through a limiter that keeps the mix below about −1 dBFS; the gains in `src/trailer/cues.ts` are first guesses, to be balanced once real files are in.

## The bed leads (owner, 2026-11-15)

The montage's bed plays under every scene from the slingshot to the console, and the effects sit under it at half their level (`UNDER` in `cues.ts`); the title's sounds, the snaps' cut and the final hit keep theirs. The take has no steady tempo, but its four big accents fall about every 2.24 s of the file (2.07, 4.37, 6.59, 8.81 s). At 0.88 speed they fall every 2.5 s, a scene's length, so each scene starts the bed on one of them: every cut lands on an accent, and the next accent falls after the next cut. The montage's eight shots each start on one in turn. The lattice starts on a lighter hit (7.37 s) and runs a little slower, so its big accent lands on the strike at 9.0 s. `cues.test.ts` checks all of it.

## Snaps to black

At 12.8 s and 26.2 s **everything stops dead** and only the game's `black-cut` plays, then silence until the next shot. The alarm cuts at 12.8 s with it. The page enforces this, and a test checks it (`src/trailer/cues.test.ts`).

## The game's cues the trailer reuses (`public/audio/`, AU's prompts)

| File | When in the trailer | What it does at the cuts |
|---|---|---|
| ~~`title-out.mp3`~~ | Not used (owner, 2026-11-15) | Skipped: right after the title's hit it would be one effect up against another. The title goes out in silence |
| `main-engine.mp3` (loop) | 2.3–4.8 s, under the slingshot | Cuts at the wells |
| `opening-rumble.mp3` | 2.3 s, under the slingshot | Cut at 4.8 s |
| `well-hum.mp3` (loop) | 4.8–7.3 s, under the wells | Cuts at the lattice |
| `loss-failure.mp3` | 9.0 s, the lattice's strike | Plays out (1.5 s). R55's damage cue replaces it if AU adds one |
| `lattice-radiation.mp3` (loop) | 9.0–12.8 s, from the strike | Cut dead at 12.8 s |
| `warning.mp3` | The alarm: 9.0, 9.9, 10.8, 11.7, 12.6 s | The last is cut dead at 12.8 s |
| `black-cut.mp3` | 12.8 s and 26.2 s, the snaps | Then silence |
| `room-hum.mp3` (loop) | 7.3–9.0 s, quietly, while the camera looks at FLIGHT and the empty window; and 23.9–26.2 s, the console with Earth | Cut by the strike at 9.0 s, and at 26.2 s |
| ~~`home-reveal.mp3`~~ | Not used (owner, 2026-11-15) | Skipped: the console with Earth keeps the room's hum alone, so it is the same cabin sound as the rest of the video |

## The trailer's own cues (`src/trailer/audio/`)

Times are seconds on the trailer's timeline. **Keep prompts simple** (owner, 2026-11-15): one sound per prompt, named plainly; the length goes in ElevenLabs' duration setting, not the prompt. The page layers the sounds at each moment, so no file has to do everything. Pick takes that start right away; silence at the end is harmless.

| File | Start · length | At the cuts | Mood | Paste into ElevenLabs Sound Effects |
|---|---|---|---|---|
| `title-hit.mp3` | 0.5 s · 1.5 s | Faded out by 2.0 s; silence until the slingshot | Stark, heavy, sudden | Deep cinematic boom hit with a metallic ring. |
| `flicker-crackle.mp3` | Each flicker: title 0.95, 1.35, 1.72 s; braid 11.6, 12.0, 12.4 s · 0.15 s | Each plays out | Electrical, failing | Short electrical crackle of a flickering screen. |
| `hull-strain.mp3` | 2.6 s · 2.2 s | Cut at 4.8 s | Straining, under load | Metal spaceship hull groaning under heavy strain. |
| `well-groan.mp3` | 4.8 s · 2.5 s | Cut at 7.3 s | Vast, uncanny | Deep, slow, otherworldly groan of a huge force pulling. |
| `ship-creak.mp3` | 5.4 s · 1.8 s | Cut at 7.3 s | Twisting | Spaceship metal frame creaking as it twists. |
| `lattice-strike.mp3` | 9.0 s · 1.2 s | Plays out; cut dead at 12.8 s at the latest | Sudden, invisible | Sudden electrical impact hitting a metal spaceship hull. |
| `braid-rush.mp3` | 10.3 s · 2.5 s | Cut dead at 12.8 s | Fast, rising, dangerous | Fast whoosh of debris streaking past on both sides. |
| `montage-bed.mp3` | **Under every scene, 2.3–26.2 s** (owner, 2026-11-15), restarted on each cut · the owner's take is 11.0 s | Cut dead at both snaps | Determined, quietly driving | Low, steady pulsing synth drone, calm and determined. |
| `final-hit.mp3` | 26.5 s · 3.5 s | Plays out by 30.0 s | Final, resonant | Huge deep cinematic boom with a long dark tail. |

**The montage's bed, if the owner prefers music:** use ElevenLabs Music instead, with the same file name and an 11 s length: "Minimal dark ambient electronic underscore, 90 BPM, steady and determined."

## Credit

ElevenLabs is credited on the final card ("audio by ElevenLabs (AI-generated)") and in TR's handoff; the submission's text and the video's metadata must also say the audio is AI-generated (requirements.md, the owner's notes).
