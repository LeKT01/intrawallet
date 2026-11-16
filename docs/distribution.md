# IntraWallet 0.3.0 bêta 1

Cette candidate ajoute l’installation PWA, le chargement hors ligne de l’interface, un projet Android Capacitor et le partage des sauvegardes depuis Android.

## Installation web

Exécuter `npm ci` puis `npm run build` et servir le contenu de `dist/` en HTTPS. Garder une URL stable et servir `sw.js` et le manifeste avec un cache HTTP court ou une revalidation. Les routes utilisent les fragments URL et l’application accepte un sous-répertoire. Sur iPhone, ouvrir dans Safari, choisir Partager puis Ajouter à l’écran d’accueil et activer « Ouvrir comme app » si proposé. Sur Android, utiliser le menu Installer de Chrome.

Pour GitHub Pages, sélectionner GitHub Actions dans les paramètres Pages puis lancer manuellement « Héberger la PWA » sur `main` après fusion.
Le service worker précache uniquement les fichiers de l’interface. Une mise à jour s’active après la fermeture des instances de l’ancienne version. Les données restent dans IndexedDB. Les requêtes des fournisseurs et leurs clés ne passent pas par le cache hors ligne.

## Cotations

Le développement local garde ses relais Vite. Sur un hébergement statique et dans Capacitor, les fournisseurs directs restent accessibles selon leur couverture, leur CORS et leur réseau. SIX, Xetra et Tradegate demandent un relais HTTPS.

Pour SIX, Xetra, Tradegate, EODHD et le secours CoinMarketCap, démarrer `npm run market:relay` derrière un reverse proxy HTTPS avec limitation de débit. Définir `MARKET_ALLOWED_ORIGINS` sur les origines web autorisées, séparées par des virgules, par exemple `https://lekt01.github.io` pour la PWA et `https://localhost` pour Android. Le relais écoute sur `127.0.0.1:4180` par défaut, accepte uniquement des routes de marché. Il transmet la clé EODHD saisie par l’utilisateur au fournisseur. Le proxy HTTPS doit exclure l’en-tête `X-EODHD-Token` de ses journaux. Il ne reçoit ni positions ni transactions. Vérifier l’accès amont et les conditions de diffusion des fournisseurs avant exposition publique. Compiler avec `VITE_MARKET_RELAY_URL=https://adresse-du-relais` ou renseigner la variable Actions `MARKET_RELAY_URL`. Sans relais, les sources correspondantes sont signalées indisponibles et les derniers cours restent utilisables.

## Android et releases

Utiliser Node 24, JDK 21 et Android SDK 36. Exécuter `npm run android:sync` puis `./gradlew :app:assembleDebug` depuis `android/` (Windows : `gradlew.bat`). Le workflow Android manuel fournit l’artefact de test. L’identifiant de distribution est `com.intrawallet.app`.

Configurer les secrets Actions `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Conserver la même clé pour toutes les mises à jour de distribution. La clé de développement est distincte. Exporter la sauvegarde avant de passer d’un APK de test à un APK signé en distribution. Le workflow incrémente le code Android à partir de son numéro d’exécution.

Après validation, créer le tag correspondant à `package.json`, par exemple `v0.3.0-beta.1`. Le workflow vérifie le code et la signature avant de préparer une release **brouillon** contenant l’APK, le ZIP web et leurs sommes SHA-256. Relire et publier le brouillon comme préversion pour une bêta. Utiliser SemVer, avec `-beta.N` pour les candidates et une hausse du troisième numéro pour les correctifs compatibles.

## Transfert et vérifications physiques

Depuis Paramètres → Sauvegarde locale, exporter le JSON sur l’appareil source, transférer le fichier, puis le restaurer sur la cible. L’export comprend les positions, transactions, groupes et historiques, avec exclusion des clés API. Vérifier les données après restauration. Les origines et conteneurs de stockage peuvent être distincts entre desktop, Safari, PWA et APK. Android utilise le partage natif pour l’export.

Avant publication, tester l’installation et la relance hors ligne sur Safari et Chrome Android, le retour système et le clavier, l’import/export et une mise à jour d’APK avec la même signature. Une future version native iOS exige macOS, Xcode, un projet Capacitor iOS et une signature Apple adaptée à son mode de distribution.
