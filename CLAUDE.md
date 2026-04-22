# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A browser-based sight-reading practice app for classical guitar. It procedurally generates notated melodies, plays them back (Practice mode), or records the user playing them and scores their performance against the notation (Challenge mode).

Pure static frontend — no build system, no package manager, no tests. Each variant is a self-contained `index.html` + `app.js` + `style.css`. ABCjs is loaded from a CDN; everything else (pitch detection, melody generation, scoring, recording, audio synthesis) is hand-rolled in `app.js`.

## Running locally

Microphone (Challenge mode) and the Demo's MP3 samples both require fetch over HTTP — opening `index.html` via `file://` will partially break. Serve any variant directly from its folder:

```bash
cd Main-Template      # or Demo / LevelUltimateInitialTest / LevelUltimateInitialTestRhythm
python -m http.server 8000
# then open http://localhost:8000/
```

There are no build, lint, or test commands.

## Repository layout

Four sibling variants, each independent:

- **Main-Template/** — Current canonical version. Practice + Challenge modes selected via overlay; uses oscillator-synthesized guitar tones for playback; full pitch range; daily challenge; score history modal.
- **Demo/** — Cut-down version restricted to 6 pitches (D4, G4, A4, B4, C5, D5). Uses real recorded MP3 samples from `Demo/audio/` (`MIDI_SAMPLE_MAP` in `app.js`) instead of synthesized tones. No key/difficulty controls.
- **LevelUltimateInitialTest/** — Earlier full-feature snapshot (no mode-selection overlay; record/play/share are separate top-level buttons).
- **LevelUltimateInitialTestRhythm/** — Rhythm-focused variant ("Lead Sheet Rhythm Generator"). Keeps `app_original.js` and `index_original.html` alongside the modified files.

When changing behavior, treat **Main-Template** as the source of truth unless the task explicitly names a different variant. Changes do **not** propagate automatically — the four `app.js` files are diverged copies, not shared modules.

## app.js architecture

Each `app.js` is a single IIFE (~1500–1800 lines) organized into numbered sections marked by `// N. SECTION NAME` banners. Use these to navigate; line numbers shift between variants but the section ordering and names are stable.

Pipeline (Main-Template numbering):

1. **Music theory data** — `KEY_DEFS` (tonic MIDI, mode, ABC key sig, sharp/flat preference), `MAJOR_SCALE`/`MINOR_SCALE` interval patterns, `RANGE_LOW`/`RANGE_HIGH` MIDI bounds (E3–F5).
2. **Seeded PRNG** (`§1b`) — All randomness routes through `seededRandom()`. Re-seed via `seedPRNG(str)` so daily challenges and shareable seeds are deterministic. Never call `Math.random()` directly inside generation — only at the top of `generate()` to mint a fresh seed.
3. **Voice-leading engine** (`§3`) — `pickNextPitch` weights candidates by step size, direction reversal after leaps, beat strength (tonic/dominant/mediant boosted on strong beats), tessitura, and minor-key raised-7th resolution. `DIFFICULTY` tunes interval span, step bias, rhythm pool, and rest probability.
4. **Rhythm + melody generation** (`§4`–`§5`) — Builds an array-of-arrays of `{ pitch, duration, isRest }` per measure. Last measure is always a tonic whole/dotted note.
5. **ABC conversion + render** (`§6`) — `melodyToAbc` emits ABC notation with per-measure accidental tracking; `render` calls `ABCJS.renderAbc`. `buildExpectedNotes` flattens measures into a timed `{ midi, startTime, duration, … }` list used for both playback scheduling and scoring.
6. **YIN pitch detection** (`§7`) — Time-domain autocorrelation pitch detector running on `analyserNode.getFloatTimeDomainData` buffers. Tuned threshold ~0.10.
7. **Recording + sampling** (`§8`) — `initAudio` opens the mic, builds an `AnalyserNode` for pitch detection AND a stereo `MediaStreamDestination` for `MediaRecorder` (mono mic → both channels). `samplePitch` runs in a `requestAnimationFrame` loop pushing `{ time, hz, midi, rms }` samples.
8. **Note segmentation** (`§10`) — Collapses the per-frame pitch sample stream into discrete detected notes (consecutive samples within a semitone form one note).
9. **Scoring** (`§11`) — Two-pass time-window matching against expected notes. Pass 1 prefers pitch-class match (semitone-folded) within a generous window; pass 2 retries unmatched expectations against still-unclaimed detections in a tighter window to recover from "note stealing." Rests score correct iff no sound was detected during them. Pitch-class comparison means octave errors count as correct.
10. **Visual feedback** (`§12`) — Recolors the rendered SVG note paths: green = correct, orange = played-but-wrong-pitch, red = missed; arrows above wrong-pitch notes indicate sharp/flat direction.
11. **Sharing** (`§13b`/`§13c`) — `shareScore` rasterizes notation+score to PNG; `shareRecording` packages `audioChunks` from `MediaRecorder`. Both prefer Web Share API with file fallback to download.
12. **Main controller + playback + history** (`§15`–`§17`) — Module-level `current*` vars hold the active exercise. `attempts[]` retains up to 4 graded passes per generated melody. Score history persists to `localStorage` under `sightreading-score-history`.
13. **Mode selection** (`§18`, Main-Template only) — `selectMode("practice"|"challenge")` flips `data-mode` on `<body>`; CSS uses `.challenge-only` to show/hide UI per mode. The play button does double duty: `togglePlayback` in practice, `startRecording` in challenge.

## Conventions worth knowing

- **Pitches are MIDI numbers** end-to-end; convert to ABC only at render time (`midiToAbc`) and to Hz only at audio time (`midiToHz`).
- **Demo variant** overrides `getScalePitches` to return `DEMO_PITCHES` regardless of key — keep this in mind if porting changes from Main-Template back into Demo.
- **Mobile-safe audio**: scheduling goes through `AudioBufferSourceNode.start(audioTime)` (Demo) or oscillator `start(audioTime)` (Main-Template) on the AudioContext clock, not `setTimeout` — only UI highlighting uses `setTimeout`. Don't introduce `<audio>`-element playback for samples; it breaks iOS scheduling.
- **Stopping a recording/playback** must also tear down `recordingTimeouts`, `recordingInterval`, the `recordMetronomeGain` node, the `MediaRecorder`, and the pitch sampling RAF — partial cleanup leaves zombie metronome ticks or scoring against an empty buffer.
