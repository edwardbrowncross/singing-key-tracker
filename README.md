# Singing Key Tracker

A web app that listens while you sing a song and shows where your key centre drifts sharp or flat.

## How it works

1. **Pick the starting key**: choose the tonic, major or minor, and equal temperament or just intonation. Check that your microphone is picking you up.
2. **Sing**: each note appears as a block on a scrolling timeline. Higher notes sit higher, and silence leaves gaps.
3. **Read the colours**: green means you're where the start key says you should be, bluer means sharp, redder means flat. The app keeps following your key centre even as it drifts by several semitones.
4. **Key changes**: deliberate modulations are detected and marked, and the notes from the change onwards are judged against the new key.
5. **Play it back**: after stopping, listen to the take, optionally pitch-shifted to undo the drift.

## Tech stack

- **React 19** + **TypeScript** + **Vite 7**
- **Mantine v8**: UI components
- **pitchfinder**: Macleod algorithm for real-time pitch detection via the Web Audio API
