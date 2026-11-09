# Portefeuille Local

Application de suivi local pour les actions, ETF et cryptos, avec regroupement par actif et par plateforme. La devise de référence est le CHF. Le sélecteur du portefeuille affiche aussi les montants en EUR ou USD. Les champs de saisie restent en CHF.

## Démarrer

Avec Node.js 24, exécute les commandes suivantes à la racine du projet.

```sh
npm ci
npm run dev
```

Ouvre http://127.0.0.1:4173/. Utilise la même adresse et le même profil de navigateur pour retrouver tes données. Le passage depuis la v0.1 conserve les positions du navigateur. Pour compiler et exécuter les tests de calcul, utilise `npm run build` et `npm test`.

## Essayer la démo

Ouvre http://127.0.0.1:4173/?demo=1 ou utilise **Données → Ouvrir la démo**. Le portefeuille fictif contient 30 jours de cours, des positions sur deux plateformes et des achats, ventes et transferts. Les essais sont enregistrés dans une base locale séparée. Le bandeau de démo permet de revenir au portefeuille personnel.

## Ajouter une position ou enregistrer une opération

- **Ajouter une position** sert à enregistrer un actif que tu détiens déjà. Sélectionne la catégorie puis cherche le nom, l’indice ou le symbole. Le catalogue local distingue les variantes capitalisantes et distribuantes. Pour un actif absent, le nom suffit en mode manuel et le symbole ou l’ISIN reste facultatif.
- **Récupérer le cours** affiche le prix unitaire, sa source et sa date avant même la saisie de la quantité. La valeur actuelle correspond au **montant total de la position**, calculé avec le cours si tu laisses le champ vide. Pour saisir un **prix unitaire** qui s’applique à toutes les plateformes, ouvre l’actif dans le tableau de bord et choisis **Saisir un cours**.
- Le coût initial se renseigne comme montant payé ou comme gain ou perte en %. Avec une valeur de 500 CHF et un gain de 12 %, l’app estime le coût à 446.43 CHF.
- Dans le **Journal**, enregistre les achats, ventes et transferts pendant la période suivie. Les ventes utilisent le coût moyen pondéré de la plateforme. Un transfert conserve le coût des unités reçues et accepte des frais en CHF ou en unités.

## Cotations et historique

- [CoinGecko](https://docs.coingecko.com/demo/reference/simple-price) fournit les cours en CHF des cryptos reconnues. L’app récupère les cours à l’ouverture puis environ toutes les 60 secondes tant que l’onglet est visible. Le bouton d’actualisation permet une demande manuelle. Le dernier cours connu reste affiché avec sa date lorsque le fournisseur est indisponible. L’heure de la dernière vérification indique quand l’app a contacté les sources. La date du cours indique à quand remonte le prix utilisé.
- Les actions et ETF cotés aux États-Unis utilisent [Finnhub](https://finnhub.io/docs/api) avec une clé personnelle gratuite facultative, saisie et appliquée dans **Données**. Elle est conservée dans le stockage de session du navigateur pour permettre l’actualisation après rechargement dans le même onglet. La valorisation des ETF suisses et européens est manuelle. [Frankfurter](https://frankfurter.dev/) convertit les cours en CHF au taux de référence du jour de cotation ou au dernier taux disponible.
- Les requêtes de marché contiennent les identifiants ou symboles, ainsi que la clé si elle est fournie au service concerné. Le journal, les quantités et les montants restent dans IndexedDB.
- La courbe du portefeuille et son tableau journalier commencent à la première position ou opération. Les jours manquants peuvent être estimés avec le journal et les cours du jour de tous les actifs détenus. Les points estimés et les relevés utilisant des cours antérieurs sont indiqués. Le résultat en CHF isole les flux d’achat et de vente. Les transferts internes ne sont pas des flux externes.
- Chaque actif a sa courbe unitaire et son tableau des variations. Les cryptos du catalogue chargent environ 90 jours de cours quotidiens CoinGecko. Les actions et ETF utilisent les cours et prix d’opération disponibles dans l’app.
- Les montants et cours historiques affichés en EUR ou USD utilisent le taux de référence Frankfurter de leur date, ou le dernier taux disponible dans les sept jours précédents. La performance affichée est le résultat calculé en CHF, converti au taux de la date. Les historiques de marché et taux téléchargés sont mis en cache localement.

## Exporter et restaurer

Dans **Données**, exporte ou importe une sauvegarde JSON locale. La restauration valide le format et la cohérence du journal avant de remplacer les données. Effacer les données du site efface aussi le portefeuille de ce navigateur.

## Sources du catalogue

Les références du catalogue sont des données de repérage, distinctes des cours automatiques. Voir notamment les [listes de fonds Vanguard](https://www.ch.vanguard/content/dam/intl/europe/documents/ch/en/fund-range-product-list_eu_chq_en_pro.pdf), le [répertoire suisse justETF](https://www.justetf.com/en-ch/etf-profile.html?isin=IE00B53SZB19) et les fiches [Amundi S&P 500](https://www.amundietf.lu/pdfDocuments/monthly-factsheet/LU1135865084/ENG/LUX/RETAIL/ETF/20260531) et [Amundi marchés émergents](https://www.amundietf.ch/pdfDocuments/monthly-factsheet/LU2573967036/ENG/CHE/INSTITUTIONNEL/ETF).
