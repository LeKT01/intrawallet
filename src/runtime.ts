import { Capacitor } from '@capacitor/core'

export const nativeApp = Capacitor.isNativePlatform()
const configuredRelay = import.meta.env?.VITE_MARKET_RELAY_URL?.trim()
const hostedRelay = configuredRelay && URL.canParse(configuredRelay) ? new URL(configuredRelay) : null
export const localMarketRelay = () => !nativeApp && typeof location !== 'undefined'
  && ['localhost', '127.0.0.1', 'terminal.local'].includes(location.hostname)

export const marketRelay = () => hostedRelay?.protocol === 'https:' && !hostedRelay.username && !hostedRelay.password
  ? hostedRelay.origin : localMarketRelay() ? location.origin : undefined

export function marketUrl(path: string) {
  const origin = marketRelay()
  if (!origin) throw new Error('Relais de cotations indisponible pour cette installation.')
  return new URL(path, origin)
}
