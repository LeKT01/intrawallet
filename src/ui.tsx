import type { Decimal } from 'decimal.js'
import type { ReactNode } from 'react'

const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  positions: 'M3 7h18v13H3z M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M3 12h18 M10 12v2h4v-2',
  journal: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',
  analytics: 'M4 19h16 M6 15l4-5 4 2 5-7 M16 5h3v3',
  platforms: 'M3 9l9-5 9 5 M5 10h14 M6 11v7 M12 11v7 M18 11v7 M3 20h18',
  data: 'M4 7h16 M4 12h16 M4 17h16 M9 5v4 M15 10v4 M10 15v4',
  plus: 'M12 5v14 M5 12h14', lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  next: 'm9 6 6 6-6 6', back: 'm15 6-6 6 6 6', refresh: 'M20 7v5h-5 M4 17v-5h5 M5 9a8 8 0 0 1 14-2 M19 15a8 8 0 0 1-14 2',
  moon: 'M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z',
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  wallet: 'M19 8V5H6a2 2 0 0 0 0 4h14v10H6a2 2 0 0 1-2-2V7 M20 12h-5a2 2 0 0 0 0 4h5 M15 14h.01',
  clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  buy: 'M12 4v13m-5-5 5 5 5-5 M5 20h14',
  sell: 'M12 17V4m-5 5 5-5 5 5 M5 20h14',
  transfer: 'M4 8h15m-4-4 4 4-4 4 M20 16H5m4-4-4 4 4 4',
} as const

export type IconName = keyof typeof paths
export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

export const timestamp = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' })
const percent = new Intl.NumberFormat('fr-CH', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' })
export const percentLabel = (value: Decimal | null) => value === null ? '—' : percent.format(value.toNumber())

export function Change({ value, children }: { value: Decimal | null; children: ReactNode }) {
  return <span className={value?.gt(0) ? 'positive' : value?.lt(0) ? 'negative' : 'muted'}>{children}</span>
}

export function Metric({ label, children, note, icon, emphasis = false }: {
  label: string; children: ReactNode; note?: ReactNode; icon?: IconName; emphasis?: boolean
}) {
  return <div className={'metric' + (emphasis ? ' metric-emphasis' : '')}>
    {icon && <span className="metric-icon"><Icon name={icon} /></span>}
    <span>{label}</span><strong>{children}</strong>{note && <small>{note}</small>}
  </div>
}

export function PanelHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="panel-header section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</header>
}
