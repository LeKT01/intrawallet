import { nativeApp } from './runtime'

export function startInstalledApp() {
  if (nativeApp) {
    void import('@capacitor/app').then(({ App }) => App.addListener('backButton', ({ canGoBack }) => {
      const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)
      if (dialog) {
        if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
      } else if (canGoBack) {
        history.back()
      } else if (location.hash && location.hash !== '#overview') {
        location.hash = '#overview'
      } else {
        void App.exitApp()
      }
    })).catch(console.error)
    return
  }
  if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(new URL('./sw.js', document.baseURI)).catch(error => {
      console.warn('La mise en cache hors ligne n’a pas pu démarrer.', error)
    })
  }
}
