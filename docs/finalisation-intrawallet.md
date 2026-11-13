# IntraWallet · finalisation et fiabilité

La branche part de la V3, commit `856e511`. Le lot porte sur les parcours du quotidien, la provenance des cotations, la sauvegarde complète et les contrôles qualité. Node 24 a servi à la validation.

## Cartographie et points de vigilance

| Domaine | Fichiers principaux | Point vérifié |
| --- | --- | --- |
| Navigation, formulaires et écrans | `App.tsx`, `AnalysisViews.tsx`, `PortfolioViews.tsx`, `OperationForm.tsx`, `DailyChart.tsx`, `styles.css` | Les trois actions d’ajout réutilisent les formulaires et les routes existantes. Le bouton retour conserve l’historique de navigation. |
| Cotations | `quotes.ts`, `marketCalendar.ts`, `server/tradegateQuote.ts`, `server/xetraQuote.ts` | La recherche des ETF hors catalogue distingue la place et la devise. Une résolution ambiguë par ISIN seul ne sélectionne aucune ligne automatiquement. |
| Calculs et historique | `ledger.ts`, `portfolio.ts`, `currency.ts`, `diagnostics.ts` | Le diagnostic utilise des données de test. Le moteur de calcul et le modèle comptable restent compatibles avec les données existantes. |
| Stockage et sauvegarde | `database.ts`, `backup.ts`, `DataSettings.tsx` | L’export inclut désormais les séries téléchargées. La restauration s’effectue en une transaction. Le schéma IndexedDB reste en version 4. |
| Qualité | `tests/`, `playwright.config.ts` | Les tests de navigateur utilisent des profils neufs. Les captures de référence sont générées en démo à une date fixe. |

Une ancienne sauvegarde sans séries restaure les données qu’elle contient et vide le cache local de cotations après confirmation. Une nouvelle sauvegarde inclut ce cache et le restaure avec le reste des données. Les clés API sont exclues. Les identifiants des positions existantes restent valides. Les positions historiques saisies avec un ISIN ambigu peuvent nécessiter de confirmer leur place avant de reprendre les cotations automatiques.

## Références produit

| Référence | Déjà présent | Perfectible | Court terme | Plus tard |
| --- | --- | --- | --- | --- |
| [Wealthfolio](https://github.com/wealthfolio/wealthfolio) | Stockage local, portefeuille et historique | Parcours d’ajout et vérification de l’origine des données | Import CSV avec aperçu et dédoublonnage | Simulations patrimoniales |
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio) | Gestion multi-plateforme et répartition | Séparation entre variation de valeur et rendement | Revenus, TWR et XIRR sur données suffisamment renseignées | Indices de référence et analyse de risque |
| [Rotki](https://github.com/rotki/rotki) | Suivi crypto local, achats et transferts | Historique et identification des actifs numériques | Définir le traitement des frais réseau | Swaps, staking et connecteurs en lecture seule |

Les rendements avancés dépendent d’un journal de flux complet et de valorisations aux dates utiles. Les dividendes nécessitent un type de transaction et une stratégie de compatibilité. Les swaps et frais en unités nécessitent de tester les mouvements sur deux actifs et leurs coûts d’acquisition. Ces changements méritent des lots indépendants.
