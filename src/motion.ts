import { useLayoutEffect, useRef } from 'react'

const ease = 'cubic-bezier(.22, 1, .36, 1)'
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)')

export function usePageReveal(route: string, ready: boolean) {
  const page = useRef<HTMLElement>(null)
  const previousRoute = useRef(route)
  useLayoutEffect(() => {
    const changed = previousRoute.current !== route
    previousRoute.current = route
    const container = page.current
    const preference = reducedMotion()
    if (!container || !ready || preference.matches || !container.animate) return
    if (matchMedia('(max-width: 900px)').matches) {
      if (!changed) return
      const animation = container.animate(
        [{ opacity: .9, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }],
        { duration: 170, easing: ease, id: 'iw-mobile-route' },
      )
      const stop = () => animation.cancel()
      preference.addEventListener('change', stop)
      return () => { stop(); preference.removeEventListener('change', stop) }
    }
    const title = container.querySelector('.page-title')
    const dashboard = container.querySelector('.dashboard-grid')
    const dashboardOrder = ['.valuation-panel', '.allocation-panel', '.history-panel', '.dashboard-positions', '.dashboard-metrics', '.dashboard-counts', '.dashboard-groups', '.dashboard-activity', '.quote-status']
    const modules = dashboard
      ? dashboardOrder.flatMap(selector => [...dashboard.querySelectorAll(selector)])
      : [...container.children].filter(node => node.matches('.panel, .detail-stack, .space-grid, .platform-workspace, .group-detail-layout'))
    const elements = [...(title ? [title] : []), ...modules].slice(0, 8)
    const animations = elements.map((node, index) => node.animate(
      [{ opacity: .86, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 275, delay: Math.min(index, 5) * 48, easing: ease, fill: 'backwards', id: 'iw-page-reveal' },
    ))
    const stop = () => animations.forEach(animation => animation.cancel())
    preference.addEventListener('change', stop)
    return () => { stop(); preference.removeEventListener('change', stop) }
  }, [route, ready])
  return page
}

export function useValueReveal(value: string) {
  const ref = useRef<HTMLParagraphElement>(null)
  const previous = useRef(value)
  useLayoutEffect(() => {
    const changed = previous.current !== value
    previous.current = value
    if (!changed || reducedMotion().matches) return
    const animation = ref.current?.animate?.([{ opacity: .6 }, { opacity: 1 }], { duration: 200, easing: ease })
    return () => animation?.cancel()
  }, [value])
  return ref
}

export function useSlidingIndicator<T extends HTMLElement = HTMLElement>(selection: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const nav = ref.current
    if (!nav) return
    function measure() {
      if (!nav) return
      const active = nav.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"], button.selected')
      if (!active || !nav.clientWidth) return
      nav.style.setProperty('--active-x', active.offsetLeft + 'px')
      nav.style.setProperty('--active-y', active.offsetTop + 'px')
      nav.style.setProperty('--active-width', active.offsetWidth + 'px')
      nav.style.setProperty('--active-height', active.offsetHeight + 'px')
      nav.dataset.indicator = 'ready'
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [selection])
  return ref
}

export async function closeAnimatedDialog(dialog: HTMLDialogElement) {
  if (!dialog.open || dialog.hasAttribute('data-closing')) return
  if (!reducedMotion().matches) {
    dialog.setAttribute('data-closing', '')
    const animation = dialog.getAnimations().find(item => item instanceof CSSAnimation && item.animationName === 'iw-dialog-exit')
    await animation?.finished.catch(() => undefined)
    dialog.removeAttribute('data-closing')
  }
  if (dialog.open) dialog.close()
}
