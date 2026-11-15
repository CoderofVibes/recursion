# Sounds to make: 10 files, most important first

For the owner, in ElevenLabs **Sound Effects**. For each one: set the duration, set Loop as shown, paste the prompt, pick the take that starts right away, and download it as MP3.

**Save each file under the exact name shown and leave it in Downloads.** Say "sounds in" (or name the ones you made) and FINAL copies each into place, checks it decodes, plays it where it belongs and tells you it's in. A partial set works: a missing file plays as silence, so make them in this order and stop whenever you have to.

**`title-out` is dropped** (owner, 2026-11-15): right after the title's hit it would be one sound effect up against another, so the title goes out in silence in the video and in the game's opening.

**`home-reveal` is dropped too** (owner, 2026-11-15): the console with Earth keeps the room hum, the cabin sound the video already has.

**In so far (4 of 10):** `warning`, `main-engine`, `well-hum`, `lattice-radiation`. **Still to make (6):** `montage-bed`, `final-hit`, `lattice-strike`, `braid-rush`, `well-groan`, `ship-creak`.

You don't need to redo `opening-alarm` (R65): the game will play only its first double pip, and the video keeps the long take.

Prompts come from `docs/audio/cues.md` (the game's) and `docs/trailer/audio.md` on `p3/tr-trailer` (the video's).

## Used by both the game and the video

### 1. `warning.mp3` · one-shot · 0.75 s (set 0.8 s if the slider won't take 0.75) · Loop off

The game's warning, and the video's alarm (it plays five times).

```text
Create a one-shot sound effect lasting 0.75 seconds. Three firm rounded low-mid pulses through a small spacecraft annunciator, with a slightly lower last pulse. Immediate and clear over cabin ambience, restrained peaks, no siren sweep, clipping, speech or reverb.
```

### 2. `main-engine.mp3` · seamless loop · 4 s · Loop on

Every main-engine burn in the game; under the slingshot in the video.

```text
Create a seamless loop lasting 4 seconds. Seamless steady main engine vibration heard from inside the crew compartment, a heavy smooth mid-bass body and restrained mechanical grain. Match both loop ends. No start, shutdown, exterior roar, voice or music.
```

### 3. `well-hum.mp3` · seamless loop · 5 s · Loop on

The Well Garden's tension bed; under the wells in the video.

```text
Create a seamless loop lasting 5 seconds. Seamless subtle tension in a spacecraft cabin bulkhead, a bowed metallic low-mid tone with a slow even breathing texture and smooth loop edges. Keep it quiet, with no jumps, melody, outside-space whoosh or bass-only energy.
```

### 4. `lattice-radiation.mp3` · seamless loop · 3 s · Loop on

Plays while the ship reports Radiation high; from the lattice's strike in the video.

```text
Create a seamless loop lasting 3 seconds. Seamless radiation monitor texture over a compact spacecraft speaker, irregular but restrained dry ticks and low filtered electrical grit, steady average level, smooth edges. No high whistle, voice, sweeping alarm or music.
```

## The video's own

`montage-bed` and `final-hit` come first: the bed covers 11 of the video's 30 seconds, and the hit ends it.

### 5. `montage-bed.mp3` · one-shot · 11 s · Loop off

Under the eight console shots, 13.1–23.9 s.

```text
Low, steady pulsing synth drone, calm and determined.
```

If you'd rather have music here, use ElevenLabs **Music** instead, 11 s, same file name: `Minimal dark ambient electronic underscore, 90 BPM, steady and determined.`

### 6. `final-hit.mp3` · one-shot · 3.5 s · Loop off

The final card, 26.5 s to the end.

```text
Huge deep cinematic boom with a long dark tail.
```

### 7. `lattice-strike.mp3` · one-shot · 1.2 s · Loop off

The lattice's strike at 9.0 s.

```text
Sudden electrical impact hitting a metal spaceship hull.
```

### 8. `braid-rush.mp3` · one-shot · 2.5 s · Loop off

The braid, 10.3–12.8 s.

```text
Fast whoosh of debris streaking past on both sides.
```

### 9. `well-groan.mp3` · one-shot · 2.5 s · Loop off

The wells, 4.8–7.3 s.

```text
Deep, slow, otherworldly groan of a huge force pulling.
```

### 10. `ship-creak.mp3` · one-shot · 1.8 s · Loop off

Over the wells, from 5.4 s.

```text
Spaceship metal frame creaking as it twists.
```

## Where each goes (FINAL does this)

Numbers 1–4 into `public/audio/`, 5–10 into `src/trailer/audio/`, all on the trailer branch (`p3/tr-trailer`); they reach `main` and the public game when the trailer merges. Credit: ElevenLabs, AI-generated (A22).
