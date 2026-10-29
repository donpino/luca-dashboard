// v1.43: /log/ serves the whole app, opened on the Log tab — the old
// address keeps working, and it looks and navigates exactly like the rest.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '../styles/global.css'
import '../styles/v2.css'
import App from '../App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTab="log" />
  </StrictMode>,
)
