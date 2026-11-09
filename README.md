# Portefeuille Local

Application de suivi local pour les actions, ETF et cryptos, avec regroupement par actif et par plateforme. La devise de référence est le CHF.

## Démarrer

Avec Node.js 24, exécute les commandes suivantes à la racine du projet.

```sh
npm ci
npm run dev
```

Ouvre http://127.0.0.1:4173/. Utilise la même adresse et le même profil de navigateur pour retrouver tes données. Le passage depuis la v0.1 conserve les positions du navigateur. Pour compiler et exécuter les tests de calcul, utilise `npm run build` et `npm test`.

## Ajouter une position ou enregistrer une opération

- **Ajouter une position** sert à enregistrer un actif que tu détiens déjà. Sélectionne la catégorie puis cherche le nom, l’indice ou le symbole. Le catalogue local distingue les variantes capitalisantes et distribuantes. Pour un actif absent, le nom suffit en mode manuel et le symbole ou l’ISIN reste facultatif.
- La valeur actuelle correspond au **montant total de la position**. Pour saisir un **prix unitaire** qui s’applique à toutes les plateformes, ouvre l’actif dans le tableau de bord et choisis **Saisir un cours**.
- Le coût initial se renseigne comme montant payé ou comme gain ou perte en %. Avec une valeur de 500 CHF et un gain de 12 %, l’app estime le coût à 446.43 CHF.
- Dans le **Journal**, enregistre les achats, ventes et transferts pendant la période suivie. Les ventes utilisent le coût moyen pondéré de la plateforme. Un transfert conserve le coût des unités reçues et accepte des frais en CHF ou en unités.

## Cotations et historique

- [CoinGecko](https://docs.coingecko.com/demo/reference/simple-price) fournit les cours en CHF des cryptos reconnues. L’app récupère les cours à l’ouverture puis au plus toutes les 15 minutes pendant la consultation. Le bouton d’actualisation permet une demande manuelle. Le dernier cours connu reste utilisable avec sa date lorsque le fournisseur est indisponible.
- Les actions et ETF cotés aux États-Unis utilisent [Finnhub](https://finnhub.io/docs/api) avec une clé personnelle gratuite facultative, saisie dans **Données** et conservée en mémoire pour la session. La valorisation des ETF suisses et européens est manuelle. [Frankfurter](https://frankfurter.dev/) convertit les cours en CHF au taux de référence du jour de cotation ou au dernier taux disponible.
- Les requêtes de marché contiennent les identifiants ou symboles, ainsi que la clé si elle est fournie au service concerné. Le journal, les quantités et les montants restent dans IndexedDB.
- Le graphique utilise les opérations et les valorisations enregistrées depuis le début du suivi. Les cours antérieurs ne sont pas reconstruits. Le résultat en CHF isole les flux d’achat et de vente, hors opérations qui n’ont pas pu être valorisées. Les transferts internes ne sont pas des flux externes. La v0.1 ne conservait que la dernière saisie de valorisation de chaque position.

## Exporter et restaurer

Dans **Données**, exporte ou importe une sauvegarde JSON locale. La restauration valide le format et la cohérence du journal avant de remplacer les données. Effacer les données du site efface aussi le portefeuille de ce navigateur.

## Sources du catalogue

Les références du catalogue sont des données de repérage, distinctes des cours automatiques. Voir notamment les [listes de fonds Vanguard](https://www.ch.vanguard/content/dam/intl/europe/documents/ch/en/fund-range-product-list_eu_chq_en_pro.pdf), le [répertoire suisse justETF](https://www.justetf.com/en-ch/etf-profile.html?isin=IE00B53SZB19) et les fiches [Amundi S&P 500](https://www.amundietf.lu/pdfDocuments/monthly-factsheet/LU1135865084/ENG/LUX/RETAIL/ETF/20260531) et [Amundi marchés émergents](https://www.amundietf.ch/pdfDocuments/monthly-factsheet/LU2573967036/ENG/CHE/INSTITUTIONNEL/ETF).
