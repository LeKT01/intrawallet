# Déploiement automatique sur Infomaniak

Ce déploiement utilise `https://intrawallet.nova-studios.site` pour la PWA et les routes `/market/…`. Il cible un site Apache/PHP dédié, avec PHP 8.2 ou plus et l’extension cURL. Si le domaine change, adapter l’URL dans le workflow et l’origine autorisée dans `deploy/infomaniak/market.php`.

## Manager Infomaniak

1. Dans l’hébergement Web, ajouter un **site Apache/PHP** pour `intrawallet.nova-studios.site` et laisser le Manager configurer son DNS, ou appliquer ses indications si la zone DNS est ailleurs.
2. Activer Let’s Encrypt pour ce site et la redirection de HTTP vers HTTPS. Relever le dossier racine exact de ce site et les coordonnées SSH. Utiliser un compte SSH pouvant écrire dans ce dossier.
3. Générer une clé dédiée à GitHub Actions, sans passphrase et stockée hors du dépôt. Dans PowerShell :

   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\intrawallet-deploy" -C "intrawallet-github-actions"
   ```

   Appuyer deux fois sur Entrée à la demande de passphrase. Installer le contenu du fichier `.pub` dans `~/.ssh/authorized_keys` du compte distant. Vérifier la connexion et confirmer l’empreinte du serveur avec Infomaniak ou une connexion déjà de confiance. Utiliser ensuite l’entrée correspondante de `known_hosts` pour GitHub. Vérifier aussi que `rsync` est disponible sur le serveur.

## GitHub

Dans **Settings → Secrets and variables → Actions**, créer les variables de dépôt :

| Variable | Valeur |
| --- | --- |
| `INFOMANIAK_HOST` | Hôte SSH indiqué dans le Manager |
| `INFOMANIAK_USER` | Utilisateur SSH du déploiement |
| `INFOMANIAK_WEB_ROOT` | Racine distante du site IntraWallet, relative au compte SSH ou absolue |
| `INFOMANIAK_DEPLOY_ENABLED` | `true` après configuration |
| `MARKET_RELAY_URL` | `https://intrawallet.nova-studios.site` pour les prochains APK signés |

Créer les secrets de dépôt `INFOMANIAK_SSH_KEY` (fichier privé complet, sans suffixe `.pub`) et `INFOMANIAK_SSH_KNOWN_HOSTS` (entrée hôte vérifiée). Garder les secrets Android existants. Une clé EODHD personnelle reste saisie dans l’app, et le relais la transmet à EODHD. CoinMarketCap utilise l’API publique sans clé.

Lancer **Actions → Déployer IntraWallet sur Infomaniak → Run workflow → main**. Ensuite, chaque push sur `main` lance les tests, le build et le transfert. Le transfert laisse les anciens fichiers en place pour les clients utilisant encore une ancienne version. La vérification post-déploiement contrôle le HTML, le service worker et le routage PHP. Après le premier déploiement, tester sur iPhone avec un ETF SIX, NQSE, VUSA et LLY (LLY requiert une clé EODHD ou Finnhub), car l’accès aux fournisseurs dépend du réseau de l’hébergement.

## Migration iPhone et Android

Exporter le portefeuille sur l’ancienne adresse GitHub Pages avant d’ajouter la nouvelle PWA à l’écran d’accueil. Importer ensuite le JSON dans la PWA du sous-domaine. Pour Android, créer le prochain APK après avoir configuré `MARKET_RELAY_URL`. Le workflow Infomaniak concerne le site et le relais. La création des APK signés reste déclenchée par les tags de version.
