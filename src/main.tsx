import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import { AudioProvider } from './audio/AudioProvider.tsx'
import { SessionScreen } from './session/SessionScreen.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider>
      <AudioProvider>
        <SessionScreen />
      </AudioProvider>
    </MantineProvider>
  </StrictMode>,
)
