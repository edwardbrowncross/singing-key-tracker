import { Alert, Button, Group, Modal, Progress, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { IconMicrophone } from '@tabler/icons-react'
import { useState } from 'react'
import { usePitchDetector } from '../../audio/AudioProvider'
import { hzToMidi } from '../../audio/cents'
import { midiToNoteName, TONIC_OPTIONS } from '../../music/keys'
import type { Mode, SessionSettings, Tuning } from '../../types'
import { centsToColour, formatCents } from './colourScale'

interface SetupModalProps {
  opened: boolean
  initialSettings: SessionSettings
  /** Error from the last attempt to start (e.g. mic denied). */
  error: string | null
  onStart: (settings: SessionSettings) => void
}

/** Non-dismissible modal: choose the starting key and tuning, check the microphone, start. */
export function SetupModal({ opened, initialSettings, error, onStart }: SetupModalProps) {
  const [tonic, setTonic] = useState(String(initialSettings.key.tonic))
  const [mode, setMode] = useState<Mode>(initialSettings.key.mode)
  const [tuning, setTuning] = useState<Tuning>(initialSettings.tuning)
  const [starting, setStarting] = useState(false)
  const mic = usePitchDetector({ medianCount: 5 })

  const midi = mic.pitch === null ? null : hzToMidi(mic.pitch)
  const cents = midi === null ? 0 : (midi - Math.round(midi)) * 100

  const handleStart = async () => {
    setStarting(true)
    try {
      await onStart({ key: { tonic: Number(tonic), mode }, tuning })
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      title={<Text fw={700} size="lg">Singing Key Tracker</Text>}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Sing through a song and see where your key centre drifts sharp or flat. Pick the key the song starts in.
        </Text>

        <Group grow align="flex-end">
          <Select
            label="Starting key"
            data={TONIC_OPTIONS}
            value={tonic}
            onChange={(value) => value !== null && setTonic(value)}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
          />
          <SegmentedControl
            value={mode}
            onChange={(value) => setMode(value as Mode)}
            data={[{ value: 'major', label: 'Major' }, { value: 'minor', label: 'Minor' }]}
          />
        </Group>

        <Stack gap={4}>
          <Text size="sm" fw={500}>Tuning</Text>
          <SegmentedControl
            value={tuning}
            onChange={(value) => setTuning(value as Tuning)}
            data={[{ value: 'equal', label: 'Equal temperament' }, { value: 'just', label: 'Just intonation' }]}
          />
        </Stack>

        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="sm" fw={500}>Microphone</Text>
            {!mic.isRunning && (
              <Button size="xs" variant="light" leftSection={<IconMicrophone size={14} />} onClick={() => void mic.start()}>
                Test microphone
              </Button>
            )}
          </Group>
          {mic.isRunning && (
            <>
              <Progress value={Math.min(100, mic.level * 400)} size="sm" animated={false} />
              <Text size="sm" ta="center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {midi === null ? (
                  <Text span c="dimmed">Sing a note…</Text>
                ) : (
                  <>
                    <Text span fw={700} size="lg">{midiToNoteName(midi)}</Text>{' '}
                    <Text span c={centsToColour(cents)} fw={600}>{formatCents(cents)}</Text>
                    <Text span c="dimmed"> from equal temperament</Text>
                  </>
                )}
              </Text>
            </>
          )}
          {(mic.micError ?? error) && (
            <Alert color="red" variant="light">{mic.micError ?? error}</Alert>
          )}
        </Stack>

        <Button size="md" onClick={() => void handleStart()} loading={starting}>
          Start
        </Button>
      </Stack>
    </Modal>
  )
}
