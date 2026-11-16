const repository = 'LeKT01/portefeuille-local'
export const releasesUrl = 'https://github.com/' + repository + '/releases'
const releasesApi = 'https://api.github.com/repos/' + repository + '/releases?per_page=100'
const versionPattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/

function parseVersion(value: unknown) {
  if (typeof value !== 'string') return null
  const match = versionPattern.exec(value)
  if (!match) return null
  const parts = match.slice(1, 4).map(Number)
  const beta = match[4] === undefined ? Infinity : Number(match[4])
  return parts.every(Number.isSafeInteger) && (beta === Infinity || Number.isSafeInteger(beta))
    ? [...parts, beta] : null
}

export function findAndroidUpdate(releases: unknown, installedVersion: string) {
  const current = parseVersion(installedVersion)
  if (!Array.isArray(releases) || !current) return null
  let latest = current
  let update: { version: string; url: string } | null = null
  for (const release of releases) {
    if (release?.draft !== false || !Array.isArray(release.assets)) continue
    const version = parseVersion(release.tag_name)
    if (!version || (current[3] === Infinity && (release.prerelease || version[3] !== Infinity))) continue
    const difference = version.findIndex((part, index) => part !== latest[index])
    if (difference < 0 || version[difference] < latest[difference]) continue
    const tag = release.tag_name
    if (!tag.startsWith('v')) continue
    const name = 'IntraWallet-' + tag + '.apk'
    if (!release.assets.some((asset: { name?: string; state?: string; browser_download_url?: string } | null) =>
      asset?.name === name && asset.state === 'uploaded'
      && asset.browser_download_url === releasesUrl + '/download/' + tag + '/' + name)) continue
    latest = version
    update = { version: tag.slice(1), url: releasesUrl + '/tag/' + tag }
  }
  return update
}

export async function fetchAndroidUpdate(installedVersion: string, signal: AbortSignal) {
  const response = await fetch(releasesApi, {
    signal: signal,
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit',
    redirect: 'error',
  })
  if (!response.ok) throw new Error('GitHub Releases est indisponible.')
  const releases: unknown = await response.json()
  if (!Array.isArray(releases)) throw new Error('Réponse GitHub Releases invalide.')
  return findAndroidUpdate(releases, installedVersion)
}
