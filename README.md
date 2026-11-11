# IntraWallet

Application de suivi local pour les actions, ETF et cryptos, avec regroupement par actif et par plateforme. La devise de référence est le CHF. Le sélecteur du portefeuille affiche aussi les montants en EUR ou USD. Les achats et transactions peuvent être saisis en CHF, EUR ou USD. Le coût d’origine est conservé.

## Démarrer

Avec Node.js 24, exécute les commandes suivantes à la racine du projet.

```sh
npm ci
npm run dev
```

Ouvre http://127.0.0.1:4173/. Utilise la même adresse et le même profil de navigateur pour retrouver tes données. Le passage depuis la v0.1 conserve les positions du navigateur. Pour compiler et exécuter les tests de calcul, utilise `npm run build` et `npm test`.

## Essayer la démo

Ouvre http://127.0.0.1:4173/?demo=1 ou utilise **Paramètres → Ouvrir la démo**. Le portefeuille fictif contient 30 jours de cours, des positions sur deux plateformes et des achats, ventes et transferts. Les essais sont enregistrés dans une base locale séparée. Le bandeau de démo permet de revenir au portefeuille personnel.

## Ajouter une position ou enregistrer une opération

- **Ajouter une position** sert à enregistrer un actif déjà détenu. Le catalogue local cherche par nom, indice, symbole ou ISIN. Avec une clé EODHD active, **Rechercher sur les marchés** élargit la recherche aux places prises en charge. Vérifie le symbole, la place de cotation et la devise proposés.
- À la sélection, le formulaire demande le **cours par unité**, affiche sa devise d’origine, sa source et son horodatage, puis calcule la valeur dès la saisie de la quantité. Si le cours est indisponible, saisis la **valeur totale actuelle** en CHF, EUR ou USD, ou laisse ce champ vide. La saisie manuelle peut servir à estimer le coût et reste identifiable dans le portefeuille. Le cours de marché reprend la priorité dès qu’il est disponible. Les anciennes saisies restent disponibles dans les relevés historiques avec leur provenance.
- Le coût initial se renseigne avec le **prix d’achat unitaire et les frais**, ou comme **gain ou perte en %**. Un ancien coût total peut être conservé lors d’une modification. Le coût en devise d’origine et sa date sont conservés. Pour une saisie en EUR ou USD, le taux de référence du jour d’achat est utilisé quand la date est connue, sinon celui du jour de saisie.
- Dans le **Journal**, enregistre les achats, ventes et transferts pendant la période suivie. Les ventes utilisent le coût moyen pondéré de la plateforme. Les transferts conservent le coût des unités reçues et peuvent inclure des frais dans la devise d’origine ou en unités. La base comptable est le CHF.

## Cotations et actualisation

| Source | Couverture et fréquence dans l’application |
| --- | --- |
| [SIX Swiss Exchange](https://www.six-group.com/en/market-data/etf/closing-prices.html) | Dernières clôtures des ETF dont la ligne suisse est identifiée, sans clé lorsque l’application tourne en local. Le serveur partage le relevé entre les ETF et le conserve 30 minutes. Sur Windows, si la connexion de Node échoue ou reçoit un HTTP 407, le relais peut utiliser Windows PowerShell et l’authentification de la session Windows pour le proxy configuré. Si le proxy refuse l’accès, l’application affiche l’erreur d’authentification. Le bouton « Vérifier le cours » relance la demande immédiatement après un échec. |
| [CoinGecko](https://docs.coingecko.com/demo/reference/simple-price) | Cours indicatifs des cryptos du catalogue. Une requête groupée environ chaque minute lorsque l’onglet est actif, ou toutes les cinq minutes avec une clé Demo pour ménager le quota mensuel. |
| [EODHD](https://eodhd.com/help/plans) | Actions et ETF des places couvertes, dont SIX et Xetra. L’offre gratuite personnelle annonce 20 appels par jour et jusqu’à un an de clôtures pour les instruments accessibles. La recherche de titres compte dans le quota. |
| [Finnhub](https://finnhub.io/docs/api) | Dernier cours reçu des titres américains compatibles avec la clé de l’utilisateur. Nouvelle demande environ toutes les trois minutes en séance. |
| [Frankfurter](https://frankfurter.dev/) | Taux quotidiens de référence de la BCE pour CHF, EUR et USD. Le dernier taux disponible peut être utilisé pendant sept jours. |

Pour les actions et les ETF des autres places, saisis ta propre clé EODHD dans **Paramètres → Cotations automatiques → Appliquer les clés**. Finnhub et CoinGecko Demo sont facultatifs. Les clés sont conservées dans la session du navigateur et envoyées uniquement à leur fournisseur. Une clé utilisée par le navigateur reste accessible à son utilisateur. Les quantités, coûts, plateformes et opérations restent dans IndexedDB. En local, le serveur Vite peut relayer les requêtes EODHD vers le fournisseur pour éviter une dépendance à ses en-têtes CORS. Ce relais fonctionne sur la machine qui lance l’application. Un hébergement statique utilise l’accès direct du navigateur pour EODHD. Les cours SIX passent par le serveur local, qui télécharge le relevé commun sans transmettre le contenu du portefeuille. L’app vérifie l’ISIN, le ticker, la place et la devise de la ligne. SIX fournit une dernière clôture, tandis que l’historique se constitue au fil des relevés locaux ou via EODHD.

En mode automatique, le moteur vérifie les cours à l’ouverture, au rechargement, au retour au premier plan et à la demande. Les recherches identiques peuvent partager une requête en cours. EODHD recharge la clôture si la séance attendue a changé et réutilise les cours historiques déjà stockés. Les horaires et jours fériés sont couverts par des calendriers locaux pour les places principales, sur les années intégrées. Les autres places utilisent une estimation de fin de séance en semaine. La source et la date du cours sont affichées séparément de l’heure de vérification. En cas d’échec, l’application garde le dernier cours de marché disponible. Le statut « cours ancien » dépend de l’âge de la cotation ou de la dernière séance attendue. Les licences des clés personnelles dépendent du fournisseur et couvrent l’utilisation personnelle selon le plan. Le code du projet et les données du mode démo peuvent être partagés séparément des cotations sous licence.

## Navigation et préférences

La vue d’ensemble présente la valorisation, le résultat sur la période, la composition et les positions principales. Le **Portefeuille** propose des filtres et ouvre une fiche par actif. **Transactions** permet de filtrer, modifier ou supprimer les mouvements enregistrés. **Analyses** présente la concentration, les poids, les gains latents et l’évolution du poids par catégorie. **Plateformes** permet de créer un établissement ou de renommer ses occurrences dans les positions et transactions. **Paramètres** regroupe le thème, la devise, le mode d’actualisation, les sources et les sauvegardes.

## Valorisation et historique

- La synthèse distingue valeur détenue, coût des positions ouvertes, gain latent et gain réalisé connu. Les valeurs partielles sont signalées. Le classement utilise les gains latents en pourcentage du coût connu. Le détail d’un actif conserve les plateformes et les entrées individuelles du journal.
- Le portefeuille propose **24 h, 7 j, 1 mois, 3 mois, 6 mois, 1 an** et **Depuis le début**. L’historique commence à l’entrée dans le suivi. Une date d’acquisition antérieure reste informative. La reconstruction rejoue les quantités et les opérations. Les achats et ventes sont isolés dans le calcul du résultat, tandis qu’un transfert interne conserve les quantités du portefeuille hors frais. Les jours aux données insuffisantes restent visibles comme lacunes.
- La courbe 24 h du portefeuille repose sur ses relevés locaux. Dans le détail d’une crypto, CoinGecko peut aussi fournir ses observations intrajournalières. Les actions et ETF utilisent leurs clôtures et les relevés disponibles, sans granularité intrajournalière garantie. La courbe d’un titre utilise ses cours bruts. Le journal ne corrige pas automatiquement les splits, dividendes ni autres opérations sur titres.
- Le taux de référence courant sert aux valorisations actuelles des cours étrangers lorsque disponible. Les courbes utilisent les taux historiques de chaque date. La performance calculée en CHF est convertie dans la devise d’affichage. Les historiques téléchargés sont mis en cache localement.

## Exporter et restaurer

La migration IndexedDB ajoute une table de plateformes. Les positions, mouvements et cotations conservent leurs tables. Dans **Paramètres**, exporte ou importe une sauvegarde JSON locale. La restauration valide le format et la cohérence du journal avant de remplacer les données. Effacer les données du site efface aussi le portefeuille de ce navigateur.

## Sources du catalogue

Les références du catalogue sont des données de repérage, distinctes des cours automatiques. Voir notamment les [listes de fonds Vanguard](https://www.ch.vanguard/content/dam/intl/europe/documents/ch/en/fund-range-product-list_eu_chq_en_pro.pdf), le [répertoire suisse justETF](https://www.justetf.com/en-ch/etf-profile.html?isin=IE00B53SZB19) et les fiches [Amundi S&P 500](https://www.amundietf.lu/pdfDocuments/monthly-factsheet/LU1135865084/ENG/LUX/RETAIL/ETF/20260531) et [Amundi marchés émergents](https://www.amundietf.ch/pdfDocuments/monthly-factsheet/LU2573967036/ENG/CHE/INSTITUTIONNEL/ETF).

## Diagnostic et contrôle qualité

Dans **Espace → Diagnostic**, lance les vérifications pour contrôler IndexedDB, relire la sauvegarde en mémoire et rejouer des scénarios financiers isolés. Les contrôles réseau utilisent des instruments publics et les clés déjà configurées dans la session. Ils distinguent l’heure de la cotation témoin et celle de la dernière cotation enregistrée. Le rapport copiable ne contient ni noms d’actifs détenus, ni montants, ni clés, ni réponses brutes des fournisseurs. Les appels externes sont désactivés en mode démo.

Les exports JSON incluent les historiques de cotation téléchargés. Les anciens fichiers de sauvegarde restent compatibles.

```powershell
npm ci
npx playwright install chromium
npm test
npm run check
npm run build
npm run test:browser
npm run test:visual
```

- `npm test` lance les tests métier et les intégrations de cotations avec le runner Node.
- `npm run test:browser` lance Playwright dans des profils neufs sur le port 4174. Il vérifie les parcours, la restauration, les pannes simulées, les deux thèmes à sept largeurs et l’accessibilité des nouveaux écrans avec axe.
- `npm run test:visual` compare l’accueil, le portefeuille et l’Espace dans les deux thèmes à 390 et 1440 px. Les tests utilisent la démo, une date fixe et des animations désactivées. Les images de référence dépendent de l’OS et du rendu Chromium. Sur un nouvel environnement de référence, lance `npm run test:visual -- --update-snapshots` et inspecte les PNG avant de les adopter.
- `INTRAWALLET_CHROMIUM` permet d’utiliser un exécutable Chromium déjà installé. Compare les captures avec le même navigateur, le même OS et les mêmes polices que la référence.
