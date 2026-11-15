# The trailer's sound: cue sheet

The owner generates every file in ElevenLabs (A22). The trailer page (`src/trailer/`) schedules each sound on the timeline with Web Audio, locked to the picture, so Game Bar records both in one take. **A missing file plays as silence**, so a partial set works and each file can be auditioned as it lands: reload the page and press Space.

Two sets of files:

- **The game's cues, reused** (ledger R56), so the video sounds like the game and there are fewer files to make. Generate them from AU's prompts in [`docs/audio/cues.md`](../audio/cues.md) into `public/audio/`, with AU's file names. Each one serves the game and the video.
- **The trailer's own cues**, below. Save them as MP3 into `src/trailer/audio/` with exactly these names.

Mix: aim each export to peak around −3 dBFS. The page's master runs through a limiter that keeps the mix below about −1 dBFS; the gains in `src/trailer/cues.ts` are first guesses, to be balanced once real files are in.

## Snaps to black

At 12.8 s and 26.2 s **everything stops dead** and only the game's `black-cut` plays, then silence until the next shot. The alarm cuts at 12.8 s with it. The page enforces this, and a test checks it (`src/trailer/cues.test.ts`).

## The game's cues the trailer reuses (`public/audio/`, AU's prompts)

| File | When in the trailer | What it does at the cuts |
|---|---|---|
| `title-out.mp3` | 2.0 s, as the title goes out | The game's own sound for its title going out. TR's reading of "black-cut at every snap": the title going out has its own cue in the game |
| `main-engine.mp3` (loop) | 2.3–4.8 s, under the slingshot | Cuts at the wells |
| `opening-rumble.mp3` | 2.3 s, under the slingshot | Cut at 4.8 s |
| `well-hum.mp3` (loop) | 4.8–7.3 s, under the wells | Cuts at the lattice |
| `loss-failure.mp3` | 9.0 s, the lattice's strike | Plays out (1.5 s). R55's damage cue replaces it if AU adds one |
| `lattice-radiation.mp3` (loop) | 9.0–12.8 s, from the strike | Cut dead at 12.8 s |
| `warning.mp3` | The alarm: 9.0, 9.9, 10.8, 11.7, 12.6 s | The last is cut dead at 12.8 s |
| `black-cut.mp3` | 12.8 s and 26.2 s, the snaps | Then silence |
| `room-hum.mp3` (loop) | 23.9–26.2 s, the console with Earth | Cut at 26.2 s |
| `home-reveal.mp3` | 23.9 s, the console with Earth | Cut at 26.2 s |

## The trailer's own cues (`src/trailer/audio/`)

Times are seconds on the trailer's timeline. For each, set the duration in ElevenLabs Sound Effects to the length given, and trim one-shots to their transient.

| File | Start · length | At the cuts | Mood | Paste into ElevenLabs Sound Effects |
|---|---|---|---|---|
| `title-hit.mp3` | 0.5 s · 1.5 s | Faded out by 2.0 s, where the game's `title-out` takes over | Stark, heavy, sudden | A single deep cinematic impact, a heavy low struck-metal hit with a short sub-bass thump and a brief dark metallic ring that decays within one and a half seconds. Dry, close, no reverb wash, no riser, no whoosh, no music, no voice. |
| `flicker-crackle.mp3` | Each flicker: title 0.95, 1.35, 1.72 s; braid 11.6, 12.0, 12.4 s · 0.15 s | Each plays out | Electrical, failing | One very short electrical crackle of a failing display, a dry buzzing snap of a phosphor screen losing power for an instant, under 0.15 seconds, clean end. No hum tail, beep, voice or music. |
| `hull-strain.mp3` | 2.6 s · 2.2 s | Cut at 4.8 s | Straining, under load | A spacecraft hull straining under heavy load from inside the cabin, deep metal groaning and stressed panels flexing, low and physical, building slightly over two seconds. No explosion, no exterior roar, no voice, no music. |
| `well-groan.mp3` | 4.8 s · 2.5 s | Cut at 7.3 s | Vast, uncanny | A deep slow groan of an enormous unseen force pulling on a spacecraft, a low bowed resonance that bends downward in pitch over two and a half seconds, felt more than heard. No whoosh, no melody, no voice, no music. |
| `ship-creak.mp3` | 5.4 s · 1.8 s | Cut at 7.3 s | Twisting | The structure of a small spacecraft creaking as it is twisted and slowly rotated, long metal creaks and joints ticking under torsion, close and dry, about two seconds. No impact, no voice, no music. |
| `lattice-strike.mp3` | 9.0 s · 1.2 s | Plays out; cut dead at 12.8 s at the latest | Sudden, invisible | A sudden sharp strike on a spacecraft hull from something invisible, a crisp electrical crack fused with a heavy metallic hit and a short burst of static, then a brief rattle settling within a second. No explosion fireball, no voice, no music. |
| `braid-rush.mp3` | 10.3 s · 2.5 s | Cut dead at 12.8 s | Fast, rising, dangerous | Fast continuous rush of something streaking past both sides of a spacecraft at high speed, layered airy roars panning left and right and building in intensity over two and a half seconds, ending at full intensity with no tail. Heard from inside the cabin, no voice, no music. |
| `montage-bed.mp3` | 13.1 s · 10.8 s | Cut at 23.9 s (the console) | Determined, quietly driving | Steady low pulsing drone for a technical montage, a soft deep pulse around 90 beats per minute under a warm electronic hum, even level for eleven seconds, no build to a climax, no drums, no melody, no voice. |
| `final-hit.mp3` | 26.5 s · 3.5 s | Plays out by 30.0 s | Final, resonant | One huge deep cinematic hit with a long dark resonant tail, struck metal and sub-bass, decaying slowly to silence over three and a half seconds. No riser before it, no music, no voice. |

**The montage's bed, if the owner prefers music:** use ElevenLabs Music instead, with the same file name and an 11 s length: "Minimal dark ambient electronic underscore, 90 BPM, a soft pulsing synth bass and a warm sustained pad, steady and determined, no drums, no melody, no vocals, 11 seconds, even level throughout."

## Credit

ElevenLabs is credited on the final card ("audio by ElevenLabs (AI-generated)") and in TR's handoff; the submission's text and the video's metadata must also say the audio is AI-generated (requirements.md, the owner's notes).
