import { describe, expect, it, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { AudioProvider } from '../audio/AudioProvider'
import { SessionScreen } from './SessionScreen'

beforeAll(() => {
  // jsdom lacks these browser APIs used by Mantine.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLCanvasElement.prototype.getContext = () => null
})

describe('SessionScreen', () => {
  it('opens on the setup modal with key, tuning and start controls', async () => {
    render(
      <MantineProvider>
        <AudioProvider>
          <SessionScreen />
        </AudioProvider>
      </MantineProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy()
    expect(screen.getByText('Just intonation')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Test microphone/ })).toBeTruthy()
  })
})
