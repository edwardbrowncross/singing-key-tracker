# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A single-page app that tracks how a singer's key centre drifts sharp or flat over the course of a song, so you can see *where* in the song it happens and correct it.

1. A setup modal sets the starting key (tonic + major/minor) and tuning (equal temperament or just intonation), and offers a microphone check.
2. While running, sung pitches are segmented into notes and drawn as blocks on an auto-scrolling timeline (higher pitch = higher block; silence = gaps).
3. The key centre is tracked as a moving average of note offsets from the current best-guess key, so slow drift of several semitones is followed.
4. Blocks are coloured by how far each note is from where it should be in the start key (or the key after a detected modulation): green = in tune, bluer = sharp, redder = flat.
5. Key changes are detected (CUSUM over key-membership evidence) and back-propagated to the most likely change point.
6. After stopping, the recording can be played back, optionally pitch-shifted to undo the key drift.

The reference pitch is concert pitch (A=440, ET tonic). After a key change, cumulative drift is kept: the new reference is the old reference plus the modulation interval.

## Commands

- **Dev server:** `npm run dev` (Vite with HMR)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Lint:** `npm run lint` (ESLint 9 flat config)
- **Type check:** `npx tsc --noEmit`
- **Test:** `npm test` (Vitest, single run) / `npm run test:watch` (watch mode)

## Tech Stack

- React 19, TypeScript (strict), Vite 7
- Mantine v8 for UI components, @tabler/icons-react for icons
- pitchfinder (Macleod algorithm) for pitch detection via Web Audio API

## Architecture

Pitch units: all tracking works in fractional MIDI note numbers. The key centre (`keyRef`) and reference (`referenceRef`) are tonic pitches as continuous MIDI values that are never wrapped, so drift across several semitones stays unambiguous.

Real-time data flow: `PitchDetector` (rAF, ~60 Hz) → `useSessionState` subscription → `TrackingSession.pushPitch` → `NoteSegmenter` → `trackNote` → `KeyChangeDetector`. The session only notifies React on note boundaries and key changes; the canvas `Timeline` reads notes directly on its own rAF loop, so per-frame data never goes through React state.

Shared types live in `src/types.ts`: `Tuning` (`'equal' | 'just'`), `Mode` (`'major' | 'minor'`), `KeySpec` (`tonic` pitch class 0–11 + `mode`), `SessionSettings` (`key` + `tuning`).

Audio utilities live in `src/audio/`:

- **AudioProvider** — React context provider that manages a shared `AudioContext`, created lazily via `getOrCreateAudioContext()` (also resumes a suspended context). Creates a `PitchDetector`, `AudioRecorder` and `PlaybackPlayer` with the context; exposes ref getters `getPitchDetector()`, `getRecorder()`, `getPlayer()`. `usePitchDetector({ medianCount })` returns `{ isRunning, start, stop, pitch, level, micError }` with median-smoothed pitch (re-renders every frame — only for small live displays such as the mic check). `micErrorMessage(err)` maps getUserMedia errors to user-facing text. Mounted in `main.tsx`.
- **PitchDetector** — plain class (copied from tuning-trainer) managing mic access, an AnalyserNode and a rAF loop running Macleod detection. `subscribe()/getSnapshot()` for `useSyncExternalStore`; snapshot is `{ isRunning, pitch, level }` (`level` = RMS). Buffer size defaults to 2048 so low voices get two periods. `getSource()` exposes the mic source node so the recorder can share it. `start()`/`stop()` are idempotent.
- **AudioRecorder** — captures raw mono PCM from a source node through an AudioWorklet (source string in `recorderWorklet.ts`, loaded via Blob URL). `start(source)`, `setRecording(bool)` (pause/resume — paused audio isn't captured, so sample index = song time), `stop()` → `Recording { samples, sampleRate }`, `dispose()`.
- **pitchShift** — offline `pitchShift(samples, sampleRate, centsAt(t))`: time-varying frequency-ratio shift with unchanged duration and no formant correction. Hann-windowed 40 ms grains at 50% overlap, each read from the input resampled by the ratio; grain starts are nudged ±12.5 ms (coarse-to-fine normalised cross-correlation) to match the previous grain's natural continuation (WSOLA-style), avoiding comb filtering. Zero shift reconstructs the input.
- **PlaybackPlayer** — plays an `AudioBuffer` from an offset; `getPosition()` for the timeline cursor; `onEnded` callback.
- **cents** — `centsDistance`, `midiToHz`, `hzToMidi`.

Music theory lives in `src/music/`:

- **keys** — note/key names (`keyName`, `midiToNoteName`, `NOTE_NAMES`), tonic picker options (`TONIC_OPTIONS`), `pitchClass`, and `tonicMidi(key)` (tonic in octave 4 at concert pitch — the start reference).
- **tuningGrids** — `getTuningGrid(tuning, mode)` returns 12 chromatic degrees `{ semitones, weight, hitWidth }` relative to the tonic. ET uses whole semitones; JI uses 5-limit ratios (1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8). `weight` is key membership: 1 for diatonic degrees, 0.6 for minor's raised 6th/7th, 0.3 for chromatic. `hitWidth` is 1 for diatonic, 0.8 for altered and 2/3 for chromatic degrees. `nearestDegree(relative, grid)` finds the closest degree in any octave, scoring distance as `|offset| / hitWidth`, so the boundary between a scale tone and a neighbouring accidental sits 60:40 in the scale tone's favour (two adjacent scale tones still split 50:50). It returns the true signed offset in cents.

Tracking logic lives in `src/tracking/` (pure TS, no React/DOM — most tests are here):

- **types** — `PitchFrame`, `PitchPoint`, `SegmentedNote` (start/end time, median pitch, frame count, `contour` of smoothed `PitchPoint`s including the attack), `TrackedNote` (adds `keyRef`, `referenceRef`, `degree`, `offsetCents`, `colourCents`, `weight`), `TrackerState` (`keyRef`, `referenceRef`), `KeyChangeEvent` (`noteIndex` = back-propagated change point, `time`, `semitones`, `detectedAtIndex`).
- **noteSegmenter** — `NoteSegmenter` class: `push(frame)` returns notes closed by that frame, `current` is the live note, `flush()` closes it. Rolling 5-frame median; a note opens after 3 coherent voiced frames, closes after 4 unvoiced frames, and splits when the pitch stays >60¢ from the note's pitch for 3 coherent frames (brief spikes are absorbed). The first 60 ms (scoop) is excluded from the note pitch.
- **keyTracker** — `evaluateNote(state, note, grid)` annotates a note against the current key centre without changing it (used for the live note). `trackNote` also nudges `keyRef` by `alpha × offset` where `alpha = 1 − exp(−weight × duration / τ)` (τ = 5 s). Weight = degree membership × outlier factor (full ≤25¢, falling to 0.15 at ≥45¢); notes <100 ms get weight 0. `colourCents = (keyRef − referenceRef) × 100 + offsetCents` — measured against the current key centre so it never wraps, then shifted by accumulated drift. `trackNotes` runs a sequence.
- **keyChangeDetector** — `KeyChangeDetector` class: per candidate modulation (−5…+6 semitones) a CUSUM of `log(weight of degree in shifted key) − log(weight in current key)`, scaled by note duration (full at ≥300 ms). Crossing the threshold (7) returns `{ semitones, noteIndex }` where `noteIndex` is where that CUSUM last rose from zero (the back-propagated change point). `confidence` (0–1) drives the readout meter. Slow drift never triggers it because notes stay on the current grid.
- **keyAtTime** — `keyRefAt(notes, time, fallback)`: the `keyRef` of the latest note starting at or before `time` (binary search). Exposed as `TrackingSession.keyRefAt(time)` for the timeline's guide lines.
- **replay** — `replayFrom(notes, index, semitones, grid)` shifts `keyRef` and `referenceRef` at `notes[index]` by the modulation and re-tracks every note from there, recolouring them.
- **driftCurve** — `buildDriftCurve(notes)` (drift in semitones at the middle of each weighted note) and `driftAt(curve, t)` (linear interpolation, held at the ends). Used for playback correction.
- **TrackingSession** — plain class owning one run: song clock (injected clock, excludes paused time), segmenter, tracker state, notes, key-change events. `start/pause/resume/stop` (pause and stop flush the live note), `setTuning(tuning)` (swaps the grid and re-tracks all recorded notes from scratch, rebuilding drift, colours and key changes), `now()`, `pushPitch(hz | null)`, read accessors `getNotes()`, `getLiveNote()`, `getTrackerState()`, `getKeyChanges()`, `grid`, `settings`. On detection it replays from the change point, records a `KeyChangeEvent`, then resets and re-feeds the detector from the change point. `subscribe/getSnapshot` → `TrackingSnapshot { key (nominal, incl. modulations), driftCents, keyChangeConfidence, noteCount, keyChanges, isSinging, tuning }`, updated only on note boundaries/key changes.
- **testing/synth** — helpers for synthetic notes/frames and a seeded PRNG used by tests.

Session (UI + lifecycle) lives in `src/session/`:

- **state/types** — `SessionPhase` (`setup | running | paused | stopped`, each non-setup phase carrying `settings`) and `SessionAction` (`START | PAUSE | RESUME | STOP | RESET`).
- **state/sessionReducer** — pure phase reducer; invalid transitions return the same phase; `RESET` works from anywhere.
- **state/useSessionState** — main entry-point hook. Owns the reducer and side effects: `handleStart(settings)` saves settings, starts the detector (mic errors → `error`), starts the recorder on the detector's source, creates and starts a `TrackingSession` (wall clock `performance.now()`); a `useEffect` subscribes the session to detector frames. Pause/resume gate both the session clock and the recorder. `handleStop` stops the session, flushes the recorder into `recording`, then stops the detector. `handleReset` tears everything down.
- **state/usePlayback** — after stopping: `play(from)`, `stop`, `correct`/`setCorrect` (switching mid-playback continues from the same position), `isPlaying`, `isProcessing`, `getPosition`. Buffers (raw and drift-corrected) are built lazily and cached per recording (the corrected one is rebuilt if the session's notes array changes, e.g. after a tuning switch); correction shifts by `−driftAt(curve, t) × 100` cents.
- **state/settingsStorage** — localStorage persistence of the last `SessionSettings`, keyed by `singing-key-tracker:settings`, with per-field fallback to defaults. Also `loadNoteStyle`/`saveNoteStyle` (`NoteStyle = 'average' | 'contour'`, key `singing-key-tracker:note-style`).
- **SessionScreen** — the single page: title + `DriftReadout`, `Timeline` (fills remaining height), a bottom row with `ControlBar` centred and `ToggleBar` bottom-right (3-column grid), and `SetupModal` (mounted only in `setup`, since its mic readout re-renders every frame). Clicking the timeline when stopped plays from that point.
- **components/SetupModal** — non-dismissible Mantine `Modal`: tonic `Select`, major/minor and ET/JI `SegmentedControl`s, "Test microphone" (level bar + note name + cents from ET), Start.
- **components/Timeline** — DPR-aware canvas with its own rAF loop. 12 s window; while running "now" is pinned at 85% width; otherwise drag/wheel to pan (and auto-scroll to follow the playback cursor). Vertical range eases to fit recent notes (min 14 semitones). Draws guide lines at the in-key degrees, split into segments at key changes; each segment uses `session.keyRefAt(segmentStart)`, so the left-gutter labels match the key at the left edge of the view and each key-change line gets its own labels (on a white backing). `noteStyle` prop: `average` fills each block with one colour; `contour` fills it with a horizontal gradient following the note's `contour` (each point coloured by `colourCents + (point − pitch) × 100`, downsampled to ≤32 stops). In both styles a thin dark pitch trace of the `contour` is drawn over each block (it can extend past the block, e.g. for scoops), time ticks, dashed key-change markers labelled with the new key, note blocks coloured by `colourCents`, the live note (translucent), the "now" line and the playback cursor.
- **components/DriftReadout** — nominal key, drift (and the nearer key once drift passes a semitone), colour legend, key-change evidence meter; reads the session via `useSyncExternalStore`.
- **components/ControlBar** — Pause/Resume, Stop, Reset; when stopped, Play/Stop playback.
- **components/ToggleBar** — icon toggles (`ActionIcon`, filled = on, with tooltips): pitch contour (`IconRipple`, persisted note style), correct key drift (`IconWand`, enabled only when stopped with a recording), tuning (`IconEqual` = equal temperament / `IconEqualNot` = just intonation; enabled once a session exists, calls `session.setTuning` and saves the choice as the default).
- **components/colourScale** — `centsToColour(cents)` in OKLCH (hue 150 green at 0 → 255 blue at +50¢, → 25 red via orange at −50¢, clamped), `colourScaleGradient()`, `formatCents()`.

Hooks live in `src/hooks/`:

- **useMedianBuffer** — rolling median filter (copied from tuning-trainer); used by `usePitchDetector`.

## Testing

Tests live alongside source files as `*.test.ts(x)`. Vitest is configured in `vite.config.ts` with the jsdom environment. Tracking tests use synthetic note/frame sequences (`src/tracking/testing/synth.ts`) — e.g. a melody drifting 2.5 semitones flat, modulations up a semitone/tone, chromatic passing notes. `pitchShift` tests measure the frequency of shifted sines by zero crossings.
