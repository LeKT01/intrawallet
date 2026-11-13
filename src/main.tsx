import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { startInstalledApp } from './install'

createRoot(document.getElementById('root')!).render(<App />)

startInstalledApp()
