# Le vrai prix

Savoir ce qu'un produit coûte vraiment, où l'acheter et quand. Monorepo : site web, application mobile, logique métier partagée et base de données.

> L'application affiche pour l'instant un **jeu de données fictif** (marques, magasins et prix inventés). Aucune source de prix réelle n'est connectée.

Plan technique complet : [docs/plan-technique.md](docs/plan-technique.md).

## Prérequis

Node.js 22 ou plus et pnpm (`npm install -g pnpm`).

## Commandes

```bash
pnpm install        # installer les dépendances
pnpm dev:web        # site web sur http://localhost:3000
pnpm dev:mobile     # application mobile : scanner le QR code avec Expo Go
pnpm test           # tous les tests (métier, design system, données fictives, base de données)
pnpm typecheck      # vérification des types
pnpm lint           # analyse statique
pnpm build          # compilation de production du site
```

## Organisation

| Dossier | Contenu |
|---|---|
| `apps/web` | Site Next.js |
| `apps/mobile` | Application Expo (iOS, Android) |
| `packages/core` | Calculs : prix unitaire, fiabilité, détection des promotions trompeuses, classement |
| `packages/design-system` | Jetons de design et marque provisoire |
| `packages/demo-data` | Jeu de données fictif |
| `supabase` | Migrations SQL et tests des règles d'accès |

## Changer l'identité visuelle

Tout passe par `packages/design-system/src` :

- `brand.ts` : nom et logotype (provisoires) ;
- `tokens.ts` : couleurs des thèmes sombre et clair, espacements, rayons, typographie ;
- `apps/web/src/lib/fonts.ts` : chargement des polices du site.

Aucun écran ne contient de couleur en dur. Un test vérifie que chaque thème respecte le contraste WCAG AA.

## Base de données locale

Le projet utilise Supabase en version auto-hébergée (logiciel libre), lancée dans Docker. Rien ne passe par supabase.com.

Prérequis : Docker Desktop démarré.

```bash
pnpm db:start       # démarre PostgreSQL, l'authentification et l'API ; applique les migrations
pnpm db:status      # affiche l'URL de l'API et la clé publique
pnpm db:reset       # recrée la base à partir des migrations
pnpm db:stop        # arrête tout
```

Copier ensuite `.env.example` en `.env.local` dans `apps/web` et `apps/mobile`, et y reporter l'URL et la clé publique affichées par `pnpm db:status`. Sans ces valeurs, les applications affichent le jeu de démonstration fictif.

Seules l'URL et la clé publique vont dans les applications. La clé secrète ne doit jamais quitter le serveur.

## Comptes

Inscription, connexion (mot de passe ou code par e-mail), changement de mot de passe, export et suppression du compte sont disponibles sur le site (`/connexion`, `/inscription`, `/profil`) et dans l'application mobile (écran « Profil »).

- La logique commune est dans `packages/data-supabase/src/auth.ts` ; les écrans n'appellent jamais Supabase directement.
- Les e-mails contiennent un code à six chiffres (modèles dans `supabase/templates/`), jamais un lien : le parcours est identique sur web et mobile.
- En local, aucun e-mail ne sort de la machine : ils arrivent dans la boîte de test http://127.0.0.1:54324.
- Après une modification de `supabase/config.toml`, relancer `pnpm db:stop` puis `pnpm db:start`.
- Session : `localStorage` sur le site, trousseau chiffré du téléphone (`expo-secure-store`) dans l'application.
- En production, il faudra brancher un vrai service d'envoi d'e-mails (SMTP) sur l'instance auto-hébergée.

## Contribuer des prix

Tout utilisateur connecté peut ajouter un prix vu en magasin (`/contribuer` sur le site, « Ajouter un prix » dans le profil de l'application). S'ils n'existent pas encore, il propose en même temps le produit et le magasin.

- Rien n'est public avant validation : relevé, produit et magasin proposés restent invisibles des autres utilisateurs.
- Un modérateur valide ou refuse les relevés sur `/moderation` (site uniquement). Valider un relevé publie aussi son produit et son magasin.
- Un modérateur peut publier directement ses propres relevés.
- Sans photo de ticket ou d'étiquette, un relevé est un « signalement communautaire » : il s'affiche comme « prix constaté », jamais « prix confirmé ».
- Devenir modérateur (base locale) : créer son compte dans l'application, puis `pnpm db:moderator adresse@exemple.fr`.
- Logique commune : `packages/data-supabase/src/contributions.ts` ; règles en base : `supabase/migrations/20261116000000_contributions.sql`.

## Favoris et magasins habituels

- **Favoris** : bouton sur chaque fiche produit ; liste sur `/favoris` et en tête de l'accueil (site et application).
- **Mes magasins** (profil) : l'utilisateur indique sa commune et coche ses magasins. Chaque fiche produit affiche alors le meilleur prix parmi eux, sans modifier le classement général.
- La proximité est volontairement simple (même code postal, même département, ailleurs) : aucun calcul de distance tant que les magasins n'ont pas de coordonnées fiables.
- Ces données sont privées (RLS) et partagées entre les appareils du même compte. Logique commune : `packages/data-supabase/src/personal.ts`.

## Scanner et photo de preuve

- **Scanner** : `/scanner` sur le site (icône dans la barre de recherche), « Scanner un code-barres » dans l'onglet Prix de l'application. Un produit connu ouvre sa fiche ; un produit inconnu propose de l'ajouter, code prérempli. La saisie des chiffres reste toujours possible.
  - Site : lecture par l'API `BarcodeDetector` du navigateur (Chrome, Edge, Android). Safari et Firefox ne l'ont pas : la page l'indique et propose la saisie.
  - Application : `expo-camera`. L'image n'est jamais envoyée ni enregistrée.
- **Photo de preuve** : facultative à l'ajout d'un prix (étiquette en rayon ou ticket de caisse). Elle est réduite à 1600 px et réencodée sur l'appareil, ce qui retire la position GPS, puis déposée dans le bucket privé `proofs`.
  - Lisible uniquement par son auteur et par les modérateurs, par lien temporaire de 5 minutes.
  - Un relevé ne peut se dire « ticket » ou « étiquette » que s'il porte une photo de son auteur (règle en base). Validé et récent, un ticket s'affiche « prix confirmé ».
  - Les photos sont supprimées avec le compte.
- Après ajout d'un module natif (caméra, photos), l'application mobile doit être reconstruite : Expo Go ne suffit plus forcément.

## Essayer sur un vrai téléphone

1. Installer **Expo Go** sur le téléphone (App Store ou Google Play).
2. Mettre le téléphone sur le même Wi-Fi que le Mac.
3. `pnpm db:start`, puis `pnpm dev:phone`.
4. Scanner le QR code affiché : avec l'appareil photo sur iPhone, depuis Expo Go sur Android.

`pnpm dev:phone` donne à l'application l'adresse du Mac sur le réseau local à la place de `127.0.0.1`. Les codes de connexion envoyés par e-mail se lisent sur le Mac : http://127.0.0.1:54324.
