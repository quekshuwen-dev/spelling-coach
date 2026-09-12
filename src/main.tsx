import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProvider } from './context/AppContext'
import { unlockSpeech } from './services/speechService'
import './index.css'

// Safari only allows speech that originates in a user gesture. Unlocking on the
// very first tap means the test screen can speak without a "tap to enable" step.
const unlock = () => {
  unlockSpeech()
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
}
window.addEventListener('pointerdown', unlock, { once: true })
window.addEventListener('keydown', unlock, { once: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
