import { createRoot } from 'react-dom/client'
import App from './App'
import './theme.css'
import './styles.css'
import './workspace.css'
import { startInstalledApp } from './install'

createRoot(document.getElementById('root')!).render(<App />)

startInstalledApp()
