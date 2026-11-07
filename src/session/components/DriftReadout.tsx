import { Box, Group, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { useSyncExternalStore } from 'react'
import { keyName } from '../../music/keys'
import type { TrackingSession } from '../../tracking/TrackingSession'
import { centsToColour, colourScaleGradient, COLOUR_RANGE_CENTS, formatCents } from './colourScale'

/** Current nominal key, drift from it, the colour legend and key-change evidence. */
export function DriftReadout({ session }: { session: TrackingSession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const { key, driftCents, keyChangeConfidence } = snapshot
  const sounding = Math.round(driftCents / 100)

  return (
    <Group gap="xl" align="flex-start" wrap="wrap">
      <Stack gap={0}>
        <Text size="xs" c="dimmed">Key</Text>
        <Text fw={700} size="lg">{keyName(key)}</Text>
      </Stack>
      <Stack gap={0}>
        <Text size="xs" c="dimmed">Drift</Text>
        <Text fw={700} size="lg" c={centsToColour(driftCents)} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatCents(driftCents)}
          {sounding !== 0 && (
            <Text span size="sm" c="dimmed" fw={400}>
              {' '}(now nearer {keyName({ ...key, tonic: (((key.tonic + sounding) % 12) + 12) % 12 })})
            </Text>
          )}
        </Text>
      </Stack>
      <Stack gap={4} w={180}>
        <Text size="xs" c="dimmed">Note colour</Text>
        <Box h={10} style={{ borderRadius: 5, background: colourScaleGradient() }} />
        <Group justify="space-between">
          <Text size="xs" c="dimmed">−{COLOUR_RANGE_CENTS}¢ flat</Text>
          <Text size="xs" c="dimmed">sharp +{COLOUR_RANGE_CENTS}¢</Text>
        </Group>
      </Stack>
      <Tooltip label="Evidence that the song has changed key. A key change is accepted when this fills up.">
        <Stack gap={4} w={120}>
          <Text size="xs" c="dimmed">Key change?</Text>
          <Progress value={keyChangeConfidence * 100} size="sm" color="grape" />
        </Stack>
      </Tooltip>
    </Group>
  )
}
