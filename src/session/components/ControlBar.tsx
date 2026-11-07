import { Button, Group } from '@mantine/core'
import { IconPlayerPause, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import type { SessionPhase } from '../state/types'
import type { usePlayback } from '../state/usePlayback'

interface ControlBarProps {
  phase: SessionPhase
  playback: ReturnType<typeof usePlayback>
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onReset: () => void
}

export function ControlBar({ phase, playback, onPause, onResume, onStop, onReset }: ControlBarProps) {
  return (
    <Group justify="center" gap="sm">
      {phase.type === 'running' && (
        <Button leftSection={<IconPlayerPause size={16} />} variant="light" onClick={onPause}>Pause</Button>
      )}
      {phase.type === 'paused' && (
        <Button leftSection={<IconPlayerPlay size={16} />} variant="light" onClick={onResume}>Resume</Button>
      )}
      {(phase.type === 'running' || phase.type === 'paused') && (
        <Button leftSection={<IconPlayerStop size={16} />} variant="light" color="red" onClick={onStop}>Stop</Button>
      )}
      {phase.type === 'stopped' && playback.available && (
        <>
          {playback.isPlaying ? (
            <Button leftSection={<IconPlayerStop size={16} />} variant="light" onClick={playback.stop}>Stop playback</Button>
          ) : (
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              variant="light"
              loading={playback.isProcessing}
              onClick={() => void playback.play(0)}
            >
              Play recording
            </Button>
          )}
        </>
      )}
      <Button leftSection={<IconRefresh size={16} />} variant="subtle" color="gray" onClick={onReset}>Reset</Button>
    </Group>
  )
}
