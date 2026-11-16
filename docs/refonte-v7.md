# IntraWallet · Refonte V7

La carte patrimoine reprend le dégradé corail, le montant en blanc et les trois cartes translucides de la version publiée. Le texte dispose de sa propre colonne. L’illustration conserve une taille réduite sur téléphone et l’inclinaison au survol s’applique uniquement sur un grand écran équipé d’un pointeur précis. Le mouvement réduit désactive l’entrée et le survol.

Sur PC, la répartition accompagne le patrimoine. Le graphique indépendant s’aligne sur les positions principales et les cotations. Le résultat de période rejoint la rangée d’indicateurs, avec son signe et sa couleur sémantique. Sur mobile, le patrimoine occupe toute la largeur, puis les indicateurs et le graphique apparaissent. Quand le portefeuille inclut des groupes, le graphique précise que leur historique est exclu.

Les aperçus des thèmes, les préférences enregistrées, le menu et la navigation de V6 sont repris. Les ajustements secondaires portent sur la densité des cartes du portefeuille, les en-têtes d’actifs et de groupes et la grille des analyses. Aucun format de données ou calcul financier n’a changé.

## Contrôles

- Comparaison avec `main` au même jour et avec le même portefeuille démo de 5 891.64 CHF.
- Captures Signature et Graphite à 1440 × 900, 390 × 844 et 440 × 956. Détail du portefeuille et captures d’entrée à 0, 200, 380 et 600 ms.
- 59 tests métier, build TypeScript/Vite, 54 tests Playwright, puis 15 contrôles ciblés suite aux finitions. Les quatre tests visuels ont été rejoués après mise à jour des références.
- Parcours contrôlés sous Chromium. Le rendu Firefox/Safari et la fluidité sur téléphone physique restent à vérifier.
