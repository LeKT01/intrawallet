# Déploiement automatique sur Infomaniak

Ce déploiement utilise `https://intrawallet.nova-studios.ch` pour la PWA et les routes `/market/…`. Il cible un site Apache/PHP dédié, avec PHP 8.2 ou plus et l’extension cURL. Si le domaine change, adapter l’URL dans le workflow et l’origine autorisée dans `deploy/infomaniak/market.php`.

## Manager Infomaniak

1. Dans l’hébergement Web, ajouter un **site Apache/PHP** pour `intrawallet.nova-studios.ch` et laisser le Manager configurer son DNS, ou appliquer ses indications si la zone DNS est ailleurs.
2. Activer Let’s Encrypt et la redirection HTTPS.
3. Dans **FTP / SSH**, utiliser un compte **FTP** limité au dossier du site IntraWallet. Relever l’hôte et l’utilisateur indiqués dans le Manager. Le transfert utilise FTP explicite sur TLS (FTPES), port 21, en mode passif. Tester si nécessaire avec FileZilla en exigeant le TLS explicite.

## GitHub

Dans **Settings → Secrets and variables → Actions**, créer les secrets de dépôt avec les mêmes noms que One Immobilier :

| Secret | Valeur |
| --- | --- |
| `FTP_SERVER` | Hôte FTP indiqué dans le Manager |
| `FTP_USERNAME` | Utilisateur FTP du site IntraWallet |
| `FTP_PASSWORD` | Mot de passe du compte FTP IntraWallet |

Créer la variable de dépôt `INFOMANIAK_WEB_ROOT` avec `/` si le compte FTP est déjà limité au dossier du site. Sinon, utiliser le chemin du site tel qu’il apparaît dans le client FTP. La variable `MARKET_RELAY_URL` peut être réglée sur `https://intrawallet.nova-studios.ch` pour les prochains APK signés.

Les anciens réglages `INFOMANIAK_HOST`, `INFOMANIAK_USER` et `INFOMANIAK_FTP_PASSWORD` restent compatibles. Le workflow vérifie les réglages requis au démarrage et affiche les noms manquants. Garder les secrets Android existants. Une clé EODHD personnelle reste saisie dans l’app, et le relais la transmet à EODHD. CoinMarketCap utilise l’API publique sans clé.

Lancer **Actions → Déployer IntraWallet sur Infomaniak → Run workflow → main**. Ensuite, chaque push sur `main` lance les tests, le build et le transfert. Le transfert laisse les anciens fichiers en place pour les clients utilisant encore une ancienne version. La vérification post-déploiement contrôle le HTML, le service worker et le routage PHP. Après le premier déploiement, tester sur iPhone avec un ETF SIX, NQSE, VUSA et LLY (LLY requiert une clé EODHD ou Finnhub), car l’accès aux fournisseurs dépend du réseau de l’hébergement.

## Migration iPhone et Android

Exporter le portefeuille sur l’ancienne adresse GitHub Pages avant d’ajouter la nouvelle PWA à l’écran d’accueil. Importer ensuite le JSON dans la PWA du sous-domaine. Pour Android, créer le prochain APK après avoir configuré `MARKET_RELAY_URL`. Le workflow Infomaniak concerne le site et le relais. La création des APK signés reste déclenchée par les tags de version.
