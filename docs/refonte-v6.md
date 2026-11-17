# IntraWallet · Refonte V6

## Composition et surfaces

Le dashboard réunit le montant du patrimoine et sa courbe sur le même panneau. Le résultat corail, les cotations et les mouvements réels composent la colonne droite. Les indicateurs remplissent une rangée, puis les positions et la répartition se partagent la suivante. Sur mobile, le patrimoine et le résultat sont côte à côte. Le graphique suit, puis les indicateurs et les cotations condensées.

Signature garde la toile crème, Graphite la toile anthracite. Le corail souligne les actions et le résultat sur la période. Les panneaux de lecture sont opaques. La navigation, les fenêtres et les cotations utilisent des surfaces translucides, avec un fond opaque sur les navigateurs dépourvus de flou. Champagne reste mat et OLED conserve ses surfaces plus sombres. Les aperçus montrent un rail, une carte et une courbe.

Le filtre de portefeuille anime la révélation des cartes. La présentation indique les valeurs partielles et les cours à vérifier. La fiche d’actif reçoit un en-tête financier plus distinct. Le journal, les plateformes, Espace et les préférences adoptent les styles communs. Les calculs, données locales et sauvegardes continuent à utiliser les mécanismes existants.

## Mouvement

| Déclencheur | Comportement |
| --- | --- |
| Changement de page | Le navigateur compatible fond la vue sortante pendant 140 ms. Le rail reste visible. Les blocs entrent par ordre de lecture sur 275 ms, décalés de 48 ms, avec une translation de 10 px. |
| Navigation et sélecteurs | L’indicateur glisse vers la sélection sur 280 ms. Les éléments interactifs s’élèvent légèrement au survol. |
| Changement de période ou d’indicateur | La courbe se révèle sur 560 ms et la zone se fond sur 450 ms. Les axes ne bougent pas. Aucun point n’est interpolé entre deux états. |
| Actualisation du montant | Le montant réel change immédiatement, avec un fondu de 200 ms. |
| Menu Ajouter | La feuille monte de 24 px sur mobile en 280 ms. La fermeture dure 140 ms et rend le focus au déclencheur. |
| Changement de thème | Les couleurs et les surfaces changent sur 210 ms. Le thème enregistré est appliqué avant le montage React. |

Avec la préférence système de mouvement réduit, les transitions non essentielles sont désactivées. Les mesures de composition et les audits Axe sont exécutés à l’état stabilisé. Les tests de mouvement inspectent séparément les images intermédiaires et le focus.

## Validation

Validation locale : 59 tests métier, 50 tests Chromium, un contrôle supplémentaire en paysage à 844 × 390, quatre tests de captures, TypeScript et build. Les tests couvrent aussi les sauvegardes et la PWA hors ligne. Les scénarios responsive couvrent les largeurs de 320 à 1920 px et une hauteur mobile de 400 px. Les captures de référence sont prises à 390 et 1440 px en clair et sombre. Les mesures de performance sur appareils physiques, le zoom réel du navigateur et le test Android natif restent à faire.
