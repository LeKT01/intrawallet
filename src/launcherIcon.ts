import { registerPlugin } from '@capacitor/core'
import { nativeApp } from './runtime'

interface LauncherIconPlugin {
  setIcon(options: { icon: 'default' | 'champagne' | 'bleu' | 'emeraude' }): Promise<{ icon: string }>
}

const launcherIcon = registerPlugin<LauncherIconPlugin>('LauncherIcon')

export async function setLauncherIcon(icon: 'default' | 'champagne' | 'bleu' | 'emeraude') {
  if (!nativeApp) return
  await launcherIcon.setIcon({ icon })
}
