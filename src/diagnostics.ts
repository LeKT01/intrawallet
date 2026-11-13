import { backupText, readBackup, type PortfolioBackup } from './backup.ts'
import { currencyDisplay, dayKey, daysBefore } from './currency.ts'
import { replay, type Mark, type PortfolioData } from './ledger.ts'
import { summarize, type Position } from './portfolio.ts'

export type CheckStatus = 'ok' | 'warning' | 'failed' | 'skipped'
export type Check = { name: string; status: CheckStatus; detail: string }
export const checkLabels: Record<CheckStatus, string> = {
  ok: 'Réussi', warning: 'Avertissement', failed: 'Échec', skipped: 'Non exécuté',
}

export function checkFinancialCalculations(): Check[] {
  const at = Date.UTC(2025, 0, 6, 12)
  const asset = { category: 'crypto' as const, reference: 'BTC', name: 'Bitcoin', platform: 'Diagnostic' }
  const positions: Position[] = [
    { ...asset, id: 'a', createdAt: at, quantity: '2', cost: { kind: 'exact', amount: '100' }, valuation: null },
    { ...asset, id: 'b', createdAt: at + 1000, quantity: '1', cost: { kind: 'exact', amount: '50' }, valuation: null },
  ]
  const marks: Mark[] = [{ id: 'mark', kind: 'market', target: 'crypto/BTC', price: '60', at: at + 3000,
    sourceAt: at + 3000, source: 'Diagnostic' }]
  const data: PortfolioData = { positions, marks, operations: [
    { ...asset, id: 'sale', kind: 'sell', at: at + 2000, createdAt: at + 2000, quantity: '1', gross: '60', fee: '2' },
  ] }
  const result = replay(data)
  const total = summarize(result.holdings)
  const flows = replay({ positions: [{ ...positions[0], valuation: { amount: '100', updatedAt: at } }],
    marks: [], operations: [{ ...asset, id: 'buy', kind: 'buy', at: at + 86400000, createdAt: at + 86400000,
      quantity: '1', gross: '50', fee: '0' }] }).history.at(-1)
  const eur = currencyDisplay('EUR', [{ date: dayKey(at), quote: 'EUR', rate: '1.1' }])
  const status = (name: string, passed: boolean, detail: string): Check => ({ name, status: passed ? 'ok' : 'failed', detail })
  return [
    status('Consolidation et coût restant', result.holdings.length === 1 && result.holdings[0].quantity === '2' && total.cost.eq(100),
      'Deux acquisitions puis une vente partielle, avec contrôle des quantités et du coût moyen.'),
    status('Valorisation et gain latent', total.amount.eq(120) && Boolean(total.gain?.eq(20)), 'Valorisation des unités restantes au cours de test.'),
    status('Vente partielle et frais', Boolean(result.sales.get('sale')?.eq(8)), 'Calcul du gain réalisé après frais.'),
    status('Historique et apports', Boolean(flows?.value?.eq(150) && flows.netFlows?.eq(150) && flows.result?.eq(0)),
      'Un achat au même cours augmente la valeur et les flux sans créer de performance.'),
    status('Conversion et absence de taux', Boolean(eur.convert('100', dayKey(at))?.eq(110))
      && eur.convert('100', daysBefore(dayKey(at), 1)) === null, 'Conversion CHF vers EUR et vérification d’une date sans taux disponible.'),
  ]
}

export function checkPortfolioBackup(data: PortfolioBackup) {
  return readBackup(backupText(data))
}

export function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/quota|limité les requêtes|429/i.test(message)) return { status: 'warning', detail: 'Limite de requêtes atteinte.' } as const
  if (/407/i.test(message)) return { status: 'failed', detail: 'Le proxy réseau demande une authentification.' } as const
  if (/refusé l’accès|401|403/i.test(message)) return { status: 'failed', detail: 'Accès refusé par le fournisseur. Vérifie la configuration.' } as const
  return { status: 'failed', detail: 'Source inaccessible ou réponse invalide.' } as const
}
