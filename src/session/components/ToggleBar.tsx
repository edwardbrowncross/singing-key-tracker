import { ActionIcon, Group, Tooltip } from '@mantine/core'
import { IconEqual, IconEqualNot, IconRipple, IconWand } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { Tuning } from '../../types'

interface ToggleProps {
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function Toggle({ label, active, disabled, onClick, children }: ToggleProps) {
  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        size="lg"
        variant={active ? 'filled' : 'default'}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  )
}

interface ToggleBarProps {
  contour: boolean
  onContourChange: (value: boolean) => void
  correctDrift: boolean
  correctDriftEnabled: boolean
  onCorrectDriftChange: (value: boolean) => void
  tuning: Tuning
  tuningEnabled: boolean
  onTuningChange: (value: Tuning) => void
}

/** Icon toggles for display and processing options (bottom-right of the page). */
export function ToggleBar(props: ToggleBarProps) {
  const isEqual = props.tuning === 'equal'
  return (
    <Group gap="xs" justify="flex-end">
      <Toggle
        label={props.contour ? 'Pitch contour: on' : 'Pitch contour: off'}
        active={props.contour}
        onClick={() => props.onContourChange(!props.contour)}
      >
        <IconRipple size={20} />
      </Toggle>
      <Toggle
        label={props.correctDriftEnabled
          ? (props.correctDrift ? 'Correct key drift on playback: on' : 'Correct key drift on playback: off')
          : 'Correct key drift (available for playback after stopping)'}
        active={props.correctDrift}
        disabled={!props.correctDriftEnabled}
        onClick={() => props.onCorrectDriftChange(!props.correctDrift)}
      >
        <IconWand size={20} />
      </Toggle>
      <Toggle
        label={isEqual ? 'Tuning: equal temperament (click for just intonation)' : 'Tuning: just intonation (click for equal temperament)'}
        active={!isEqual}
        disabled={!props.tuningEnabled}
        onClick={() => props.onTuningChange(isEqual ? 'just' : 'equal')}
      >
        {isEqual ? <IconEqual size={20} /> : <IconEqualNot size={20} />}
      </Toggle>
    </Group>
  )
}
