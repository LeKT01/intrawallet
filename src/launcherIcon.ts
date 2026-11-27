import { Capacitor, registerPlugin } from '@capacitor/core'

interface LauncherIconPlugin {
  setIcon(options: { icon: 'default' | 'champagne' | 'bleu' | 'emeraude' }): Promise<{ icon: string }>
}

export const canChangeLauncherIcon = Capacitor.isNativePlatform()
  && Capacitor.isPluginAvailable('LauncherIcon')

const launcherIcon = registerPlugin<LauncherIconPlugin>('LauncherIcon')

export async function setLauncherIcon(icon: 'default' | 'champagne' | 'bleu' | 'emeraude') {
  if (!canChangeLauncherIcon) return
  await launcherIcon.setIcon({ icon })
}
