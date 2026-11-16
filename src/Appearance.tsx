import { useEffect, useState } from 'react'

const modes = ['light', 'dark', 'system'] as const
const densities = ['comfortable', 'compact'] as const
const lightVariants = ['coral', 'champagne'] as const
const darkVariants = ['graphite', 'oled'] as const
const themeLabels = { coral: 'Corail Classique', champagne: 'Champagne', graphite: 'Graphite', oled: 'Noir OLED' }
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

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function apply() {
      const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode
      Object.assign(document.documentElement.dataset, {
        theme: resolved,
        variant: resolved === 'dark' ? dark : light,
        density,
      })
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mode, light, dark, density])

  return { mode, setMode, light, setLight, dark, setDark, density, setDensity }
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
    <div className="variant-grid">
      <ThemeOptions label="Variantes claires" variants={lightVariants} selected={appearance.light} onSelect={variant => {
        saveAppearancePreference('theme.light', variant)
        appearance.setLight(variant)
      }} />
      <ThemeOptions label="Variantes sombres" variants={darkVariants} selected={appearance.dark} onSelect={variant => {
        saveAppearancePreference('theme.dark', variant)
        appearance.setDark(variant)
      }} />
    </div>
  </section>
}

function ThemeOptions<T extends keyof typeof themeLabels>({ label, variants, selected, onSelect }: {
  label: string; variants: readonly T[]; selected: T; onSelect: (variant: T) => void
}) {
  return <fieldset className="theme-options">
    <legend>{label}</legend>
    {variants.map(variant => <label className="theme-option" key={variant}>
      <input type="radio" name={label} checked={selected === variant} onChange={() => onSelect(variant)} />
      <span className="theme-preview" data-variant={variant} aria-hidden="true">
        <span className="preview-rail" />
        <span className="preview-card"><i /><i /><i /></span>
        <span className="preview-accent" />
      </span>
      <strong>{themeLabels[variant]}</strong>
    </label>)}
  </fieldset>
}
