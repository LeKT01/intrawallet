import { useLayoutEffect, useState } from 'react'

const modes = ['light', 'dark', 'system'] as const
const densities = ['comfortable', 'compact'] as const
const lightVariants = ['coral', 'champagne'] as const
const darkVariants = ['graphite', 'oled', 'bleu', 'emeraude'] as const
const themeLabels = {
  coral: 'Signature', champagne: 'Champagne', graphite: 'Graphite', oled: 'Noir OLED',
  bleu: 'Bleu Glacier', emeraude: 'Émeraude',
}
const themeLogos: Partial<Record<keyof typeof themeLabels, string>> = {
  champagne: 'intrawallet-champagne-192.png',
  bleu: 'intrawallet-bleu-192.png',
  emeraude: 'intrawallet-emeraude-192.png',
}
function themeLogo(variant: keyof typeof themeLabels) {
  return import.meta.env.BASE_URL + 'app-icons/' + (themeLogos[variant] ?? 'intrawallet-wallet-192.png')
}
const prefix = 'portefeuille.'

export function readAppearancePreference<T extends string>(key: string, options: readonly T[], fallback: T) {
  try {
    return options.find(value => value === localStorage.getItem(prefix + key)) ?? fallback
  } catch {
    return fallback
  }
}

export function saveAppearancePreference(key: string, value: string) {
  try { localStorage.setItem(prefix + key, value) } catch { /* Keep the preference in memory. */ }
}

export function useAppearance() {
  const [mode, setMode] = useState(() => readAppearancePreference('theme', modes, 'system'))
  const [light, setLight] = useState(() => readAppearancePreference('theme.light', lightVariants, 'coral'))
  const [dark, setDark] = useState(() => readAppearancePreference('theme.dark', darkVariants, 'graphite'))
  const [density, setDensity] = useState(() => readAppearancePreference('density', densities, 'comfortable'))

  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  const variant = theme === 'dark' ? dark : light

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useLayoutEffect(() => {
    const { dataset } = document.documentElement
    const changed = dataset.theme !== theme || dataset.variant !== variant
    Object.assign(dataset, { theme, variant, density })
    if (!changed) return
    dataset.themeTransition = ''
    const timer = window.setTimeout(() => { delete dataset.themeTransition }, 240)
    return () => {
      window.clearTimeout(timer)
      delete dataset.themeTransition
    }
  }, [theme, variant, density])

  return { mode, setMode, theme, light, setLight, dark, setDark, density, setDensity, logo: themeLogo(variant) }
}

export default function Appearance({ appearance }: { appearance: ReturnType<typeof useAppearance> }) {
  return <section className="panel preference-panel appearance-panel" id="appearance" aria-labelledby="appearance-title" tabIndex={-1}>
    <h2 id="appearance-title">Apparence</h2>
    <div className="appearance-controls">
      <label>Thème<select aria-label="Thème" value={appearance.mode} onChange={event => {
        const next = event.target.value as (typeof modes)[number]
        saveAppearancePreference('theme', next)
        appearance.setMode(next)
      }}>
        <option value="system">Système</option><option value="light">Clair</option><option value="dark">Sombre</option>
      </select></label>
      <label>Densité<select aria-label="Densité" value={appearance.density} onChange={event => {
        const next = event.target.value as (typeof densities)[number]
        saveAppearancePreference('density', next)
        appearance.setDensity(next)
      }}>
        <option value="comfortable">Confortable</option><option value="compact">Compacte</option>
      </select></label>
    </div>
    {appearance.theme === 'dark'
      ? <ThemeOptions label="Variantes sombres" variants={darkVariants} selected={appearance.dark} onSelect={variant => {
        saveAppearancePreference('theme.dark', variant)
        appearance.setDark(variant)
      }} />
      : <ThemeOptions label="Variantes claires" variants={lightVariants} selected={appearance.light} onSelect={variant => {
        saveAppearancePreference('theme.light', variant)
        appearance.setLight(variant)
      }} />}
  </section>
}

function ThemeOptions<T extends keyof typeof themeLabels>({ label, variants, selected, onSelect }: {
  label: string; variants: readonly T[]; selected: T; onSelect: (variant: T) => void
}) {
  return <fieldset className="theme-options">
    <legend>{label}</legend>
    {variants.map(variant => <label className="theme-option" key={variant}>
      <span className="theme-preview" data-variant={variant} aria-hidden="true">
        <span className="preview-rail"><i /><i /><i /></span>
        <span className="preview-hero"><small>Patrimoine</small><b>— CHF</b></span>
        <span className="preview-card">
          <svg viewBox="0 0 90 22" preserveAspectRatio="none"><path d="M1 20 L16 16 L29 18 L44 8 L58 11 L72 4 L89 2" /></svg>
        </span>
        <span className="preview-widget"><i /><i /></span><span className="preview-accent">+</span>
      </span>
      <span className="theme-option-label">
        <img src={themeLogo(variant)} alt="" width="22" height="22" />
        <strong>{themeLabels[variant]}</strong>
        <input type="radio" name={label} checked={selected === variant} onChange={() => onSelect(variant)} />
      </span>
    </label>)}
  </fieldset>
}
