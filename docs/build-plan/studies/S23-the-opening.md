# S23 — The opening

**Thread:** GPT/Codex · **Branch:** `st/s23-the-opening` · **Worktree:** `.worktrees/s23` · **Read:**
- [the study rules](README.md);
- DECISIONS **A21, the owner's opening**, then A8 (the room, the ~6 s loss sequence, the Night Watch palette), A9, A12, A17 (the ending, which mirrors the opening) and A22 (audio);
- `docs/CREATIVE_BRIEF.md` §1–3 and §10 with its addenda;
- `docs/design/visual-direction.md`;
- `src/view3d/README.md` and `src/theme/README.md`, read only;
- `docs/design/regions/c01-unfamiliar-sky.md` and `docs/design/regions/h02-familiar-sky.md`.

## Question
The owner's opening (A21):
1. The game opens with the player looking at the main console, Earth in the distance, on the way home from Mars.
2. Lights start flashing and the ship shakes. The player's view shakes as they try to keep their balance.
3. Then dark. The title, RECURSION, enters the dark screen.
4. The player wakes up in the new, recursive universe.

It echoes the loss sequence the player will come to know, and the ending (A17) plays that sequence once more to bring them home, back at the console with Earth in the distance. Script it so thread OP can build it and it lands.

## Deliver
In `docs/studies/s23/`, with any calculations in `tools/studies/s23/`:
1. **A beat sheet** with timings in seconds. For each beat give:
   - **the camera:** where the player looks, and the shake's amplitude and frequency over time, including the stumbles as they keep their balance;
   - **the lights:** colours from the palette, alarms and flashes;
   - **the window:** Earth in the distance on a Mars-to-Earth return. Compute its honest angular size and phase for a plausible distance, and say what the stars do. Then decide what the black hole looks like, if anything: only its effects, a glimpse of lensing through the window, or nothing at all. Compare and recommend.
   - **the dark,** and the title RECURSION entering it, with typography from the theme and its timing;
   - **the wake-up in C01,** and how the first wake-up differs from every later recurrence.
2. **The rhyme with the ending (A17):** what the opening and ending share (the same console view, the same framing of Earth), and what's different, so the ending lands as the opening's mirror.
3. **Rules:**
   - it plays on a new save's first launch only, and never on recurrence (A9);
   - it can be skipped after the first time;
   - no input is needed;
   - **photosensitivity:** flashes stay at 3 per second or fewer, and there's a reduced-motion option for the shake.
4. **Sound cues** for thread AU: each sound, when it plays and for how long, its mood, and a draft text prompt to generate it in ElevenLabs (A22). Examples: the room's hum, the alarm, the rumble, the dark, the title.
5. **Honesty:** the black hole on a route home from Mars is fiction, so label it `[FICTIONAL]`. Earth's appearance is accurate for its distance.
6. **Build notes for OP:**
   - the hooks it needs from the room: swapping the window's sky, lighting cues, camera shake, fade, the title card;
   - Earth's imagery and its licence. Prefer NASA imagery whose terms are recorded, or procedural rendering; no third-party image without a recorded licence (S10, S13).

Don't edit `src/`. Commit on `st/s23-the-opening`, and write your handoff to `docs/handoffs/s23.md` using the template.
