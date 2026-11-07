import { Box, Container, Group, Stack, Text, Title } from '@mantine/core'
import { useState, useSyncExternalStore } from 'react'
import { ControlBar } from './components/ControlBar'
import { DriftReadout } from './components/DriftReadout'
import { SetupModal } from './components/SetupModal'
import { Timeline } from './components/Timeline'
import { ToggleBar } from './components/ToggleBar'
import type { Tuning } from '../types'
import { loadNoteStyle, loadSettings, saveNoteStyle, saveSettings, type NoteStyle } from './state/settingsStorage'
import { usePlayback } from './state/usePlayback'
import { useSessionState } from './state/useSessionState'

const noSubscribe = () => () => {}
const noSnapshot = () => null

/** The whole app: setup modal, readout, timeline and controls on one page. */
export function SessionScreen() {
  const { phase, session, recording, error, handleStart, handlePause, handleResume, handleStop, handleReset } = useSessionState()
  const playback = usePlayback(session, recording)
  // Re-read on reset so the modal reopens with the most recently used settings.
  const [initialSettings, setInitialSettings] = useState(loadSettings)
  const [noteStyle, setNoteStyle] = useState<NoteStyle>(loadNoteStyle)

  const snapshot = useSyncExternalStore(session?.subscribe ?? noSubscribe, session?.getSnapshot ?? noSnapshot)
  const tuning = snapshot?.tuning ?? initialSettings.tuning

  const onContourChange = (contour: boolean) => {
    const style: NoteStyle = contour ? 'contour' : 'average'
    setNoteStyle(style)
    saveNoteStyle(style)
  }

  const onTuningChange = (value: Tuning) => {
    session?.setTuning(value)
    saveSettings({ ...loadSettings(), tuning: value })
  }

  const onReset = () => {
    handleReset()
    setInitialSettings(loadSettings())
  }

  const onSeek = (time: number) => {
    if (phase.type === 'stopped' && playback.available) void playback.play(time)
  }

  return (
    <Container fluid p="md" h="100dvh">
      <Stack h="100%" gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Title order={3}>Singing Key Tracker</Title>
          {session && <DriftReadout session={session} />}
        </Group>
        <Box style={{ flex: 1, minHeight: 240 }}>
          <Timeline
            session={session}
            noteStyle={noteStyle}
            follow={phase.type === 'running'}
            getPlaybackPosition={playback.getPosition}
            onSeek={onSeek}
          />
        </Box>
        {phase.type === 'stopped' && playback.available && (
          <Text size="xs" c="dimmed" ta="center">Drag to scroll. Click the timeline to play from that point.</Text>
        )}
        {phase.type === 'paused' && (
          <Text size="xs" c="dimmed" ta="center">Paused. Drag to scroll back through the song.</Text>
        )}
        {/* Three columns keep the main controls centred with the toggles bottom-right. */}
        <Box style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 'var(--mantine-spacing-sm)' }}>
          <div />
          <ControlBar
            phase={phase}
            playback={playback}
            onPause={handlePause}
            onResume={handleResume}
            onStop={() => void handleStop()}
            onReset={onReset}
          />
          <ToggleBar
            contour={noteStyle === 'contour'}
            onContourChange={onContourChange}
            correctDrift={playback.correct}
            correctDriftEnabled={phase.type === 'stopped' && playback.available && !playback.isProcessing}
            onCorrectDriftChange={playback.setCorrect}
            tuning={tuning}
            tuningEnabled={session !== null}
            onTuningChange={onTuningChange}
          />
        </Box>
      </Stack>
      {/* Only mounted during setup: its live mic readout re-renders on every detector frame. */}
      {phase.type === 'setup' && (
        <SetupModal opened initialSettings={initialSettings} error={error} onStart={handleStart} />
      )}
    </Container>
  )
}
