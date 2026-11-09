# Portefeuille local

Première version de développement. Elle permet de saisir des positions existantes, de les valoriser manuellement en CHF et de les regrouper par actif, avec le détail par plateforme.

## Démarrer sur Windows ou macOS

1. Décompresse l’archive et ouvre un terminal dans le dossier `portefeuille`.
2. Avec Node.js 24 et npm, lance les commandes suivantes.

```sh
npm ci
npm run dev
```

3. Ouvre http://127.0.0.1:4173/ dans ton navigateur habituel. Pour retrouver tes positions, garde le même navigateur, le même profil et cette adresse.

Le dossier `dist` contient aussi la version compilée. Si tu as déjà Python, tu peux la lancer directement, sans installer les dépendances npm.

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

## Ajouter une position

- Choisis Action, ETF ou Crypto. Saisis le nom et l’identifiant de l’actif. Pour les actions et les ETF, indique un ISIN ou une référence au format marché:symbole. Utilise la même référence pour regrouper un actif détenu sur plusieurs plateformes.
- Saisis la plateforme et la quantité. La valeur manuelle en CHF est facultative. Si elle manque, la ligne est signalée comme non valorisée.
- Renseigne éventuellement le coût total ou la performance initiale. Pour une position valorisée à 500 CHF avec un gain de 12 %, le coût estimé est de 446.43 CHF à l’affichage. Modifier ensuite la valeur de marché saisie ne recalcule pas le coût initial.
- Ouvre une ligne dans les positions consolidées pour afficher ses entrées. Le journal permet de modifier ou de supprimer une saisie.

## Périmètre

Les données sont dans IndexedDB, sans compte, sans service distant et sans cotation automatique. Les valeurs et les coûts sont saisis en CHF. L’historique de performance, les achats, les ventes et les transferts, ainsi que l’export et la restauration, sont prévus dans les étapes suivantes. La suppression des données du site efface les positions du navigateur.

Pour contrôler les types et recompiler, lance `npm run build`.
