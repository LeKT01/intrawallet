import type useAndroidUpdate from './useAndroidUpdate'
import { releasesUrl } from './updates'
import { marketRelay, nativeApp } from './runtime'

export default function InstallHelp({ androidUpdate, online }: { androidUpdate: ReturnType<typeof useAndroidUpdate>; online: boolean }) {
  return <section id="installation" className="panel settings-panel" tabIndex={-1}>
    <h2>Installer IntraWallet</h2>
    <p className="hint">Version {__APP_VERSION__}</p>
    <p><strong>iPhone</strong> · Ouvre le site HTTPS dans Safari, touche Partager, puis Ajouter à l’écran d’accueil. Active « Ouvrir comme app » si l’option apparaît.</p>
    <p><strong>Android</strong> · Ouvre le site HTTPS dans Chrome et choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ». L’APK est disponible lorsque le fichier signé est joint à une release.</p>
    {nativeApp && <div>
      <button type="button" className="secondary" disabled={!online || androidUpdate.status === 'checking'}
        onClick={() => void androidUpdate.check(true)}>Vérifier les mises à jour</button>
      {androidUpdate.status === 'checking' && <p className="hint" role="status">Vérification sur GitHub…</p>}
      {androidUpdate.status === 'checked' && !androidUpdate.update && <p className="hint" role="status">Aucune version Android plus récente disponible.</p>}
      {androidUpdate.status === 'error' && <p className="hint" role="status">GitHub est inaccessible. Réessaie dans un moment.</p>}
    </div>}
    <a href={releasesUrl} target="_blank" rel="noreferrer">Voir les releases GitHub</a>
    <p className="hint">{nativeApp ? 'Application Android installée.' : 'Après un premier chargement complet, le site peut s’ouvrir hors ligne.'}
      {' '}Pour transférer ton portefeuille, exporte le JSON depuis l’appareil source puis restaure-le sur le nouvel appareil.</p>
    {!marketRelay() && <p className="hint">SIX, Xetra et Tradegate nécessitent un relais de marché configuré. Tu peux utiliser les fournisseurs directs compatibles, les cours déjà enregistrés et les valorisations manuelles.</p>}
  </section>
}
