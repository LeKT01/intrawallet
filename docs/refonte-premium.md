# IntraWallet 0.3.0-beta.6

## Dashboard et navigation

La vidéo du dashboard montre un rail sombre compact, une zone principale asymétrique, des statistiques courtes et une carte d’accent latérale. IntraWallet reprend cette composition. La valeur du portefeuille ouvre la lecture, le graphique arrive juste après, puis les indicateurs. La colonne secondaire regroupe le résultat de la période, l’état des cotations et la répartition. Sur mobile, le patrimoine et son évolution précèdent les indicateurs et les modules secondaires.

La vidéo sur les couleurs attribue deux rôles aux tons calmes, le fond et les surfaces, et un rôle distinct à l’accent. En clair, la toile crème ou sable contraste avec les panneaux ivoire. En sombre, l’anthracite ou le noir profond fait ressortir les surfaces graphite. Le corail guide le regard vers les actions et la carte de résultat. Les gains et pertes disposent de leurs propres couleurs et signes.

## Écrans et préférences

Dans le portefeuille, les vues Cartes et Tableau utilisent les mêmes filtres et le même tri. Le journal propose des filtres directs pour les achats, les ventes et les transferts. Les fiches placent la synthèse avant l’historique. Les groupes affichent le mode de suivi dans l’en-tête, avec composition et évolution côte à côte sur les grands écrans. Les plateformes utilisent une grille repliable. Espace regroupe les liens en deux panneaux.

Les variantes Corail Classique et Champagne sont disponibles en clair, Graphite et Noir OLED en sombre. En mode Système, chaque déclinaison mémorisée s’applique à la préférence du système. Le réglage de densité modifie les espacements des panneaux, grilles et listes. Les préférences précédentes Clair, Sombre et Système utilisent leur clé existante. IndexedDB, les historiques et le format des sauvegardes sont conservés.

## Vérifications

- 59 tests métier, vérification TypeScript et build de production.
- 46 tests Chromium couvrant notamment le stockage, la sauvegarde, les groupes, la PWA, le responsive, les contrastes sur le dashboard et les préférences, la persistance des thèmes et le changement de présentation.
- Largeurs de 320, 360, 375, 390, 414, 440, 600, 768, 820, 1024, 1280, 1440 et 1920 px selon les parcours.
- Captures de référence Chromium Linux à 390 et 1440 px pour le dashboard, le portefeuille et Espace, en clair et en sombre.
- Le contrôle de contraste automatisé couvre les parcours testés. Le contrôle physique sur iOS et Android reste à faire avant publication.

Les références de capture sont dans `tests/browser/visual.spec.ts-snapshots`. Les captures de test utilisent le portefeuille de démonstration ou des données de test isolées.
