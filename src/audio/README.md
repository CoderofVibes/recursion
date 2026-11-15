# Audio

The AU mount in `App.tsx` connects the Web Audio mixer to the opening and samples the live room's existing belief-side reads. The room's loss overlay supplies the visual stages. Opening, loss and recurrence stay on those presentation clocks even during ship warp.

The owner's [cue list](../../docs/audio/cues.md) gives the filenames and ElevenLabs prompts. The build discovers the clips in `public/audio/`. The mixer loads and decodes available clips after the first trusted gesture. One-shots use the buffers available at the moment of the cue.

Use `soundAvailable()` from `index.ts` to show the existing sound control when the build has audio. Its mute state comes from `src/app/sound.ts`. A volume control can use `soundVolume()`, `setSoundVolume(0…1)` and `onSoundVolume(listener)`. The master level defaults to 65% and persists in this browser.
