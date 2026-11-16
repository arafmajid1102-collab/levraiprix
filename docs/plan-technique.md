# Le vrai prix — plan technique

État au 15 novembre 2026. Ce document décrit ce qui est décidé, ce qui est construit et ce qui reste à faire. Tout ce qui est marqué « construit » est dans le dépôt et testé ; le reste est un plan.

## 1. Architecture

```
            ┌────────────── apps/web (Next.js 16) ──────────────┐
Navigateur ─┤  rendu serveur, pages publiques indexables        │
            └───────────────────────┬───────────────────────────┘
            ┌────────────── apps/mobile (Expo 58) ──────────────┐
iOS/Android ┤  React Native, onglets natifs                     │
            └───────────────────────┬───────────────────────────┘
                                    │  même code métier
     packages/core ─ calculs déterministes (prix unitaire, fiabilité, promotions, classement)
     packages/design-system ─ jetons de design (couleurs, typographie, espacements)
     packages/demo-data ─ jeu fictif, isolé
                                    │  interface CatalogRepository
                                    ▼
     Supabase AUTO-HÉBERGÉ (Docker) : PostgreSQL + RLS · Auth · Storage · Edge Functions
                                    ▲
     Tâches serveur (à venir) : import des sources ouvertes, validation des contributions,
     OCR et assistant (seuls endroits où une clé d'IA existe)
```

Principes :

- **La logique métier n'est écrite qu'une fois**, en TypeScript pur dans `packages/core`, sans dépendance. Web, mobile et serveur l'importent. Un prix unitaire ou un verdict de promotion est donc identique partout.
- **Les écrans ne connaissent pas la source des données.** Ils passent par l'interface `CatalogRepository`. Le jeu fictif l'implémente aujourd'hui ; Supabase l'implémentera sans toucher aux écrans.
- **Aucun secret côté client.** Le client n'aura que l'URL Supabase et la clé publique ; la sécurité repose sur les règles RLS. Les clés d'IA et la clé de service restent dans les fonctions serveur.

## 2. Arborescence

```
apps/
  web/                 Next.js (App Router) — accueil, recherche, fiche produit, profil
  mobile/              Expo Router — 5 onglets + fiche produit
packages/
  core/                types, units, reliability, promo, product-view, format, barcode, search
  design-system/       brand.ts, tokens.ts, css.ts (génère les variables CSS du web)
  demo-data/           catalogue fictif déterministe
supabase/
  migrations/          schéma SQL versionné
  tests/               tests RLS sur PostgreSQL embarqué (PGlite)
docs/                  ce plan
```

## 3. Technologies retenues

| Choix | Raison | Alternative écartée |
|---|---|---|
| **pnpm workspaces** seul | Suffit pour 6 paquets ; un outil de moins à maintenir | Turborepo : utile quand les builds deviendront longs, pas avant |
| **Next.js 16** (web) | Rendu serveur pour le référencement des fiches produit, cache intégré | Expo Web seul : pas de SEO sérieux |
| **Expo 58 / React Native** (mobile) | Un seul code iOS + Android, compilation cloud (EAS) sans Mac ni Xcode obligatoire | Flutter : interdirait le partage du code métier TypeScript |
| **Supabase auto-hébergé dans Docker** (logiciel libre, pas le service supabase.com) | PostgreSQL relationnel (historique de prix, foyers), RLS, auth e-mail/Google/Apple/code, stockage privé ; déployable sur tout serveur acceptant Docker, données en PostgreSQL standard donc sans enfermement | Firebase : NoSQL inadapté aux comparaisons ; backend NestJS sur mesure : des mois pour refaire ce que Supabase fournit |
| **CSS Modules + variables** (web), **StyleSheet** (mobile) | Aucune dépendance de style ; tout vient des jetons | Tailwind/NativeWind : deux configurations à synchroniser avec les jetons |
| **Vitest** | Rapide, même outil pour tous les paquets | — |
| **PGlite** (tests SQL) | Vrai PostgreSQL sans Docker : les règles d'accès sont testées localement | Tests seulement sur le cloud : lents et dépendants du réseau |

Deux interfaces distinctes (web et mobile) plutôt qu'un code d'écran unique : c'est voulu. Le web a une barre latérale, des tableaux larges et du rendu serveur ; le mobile a des onglets natifs. Ce qui doit être identique (calculs, couleurs, vocabulaire) est partagé.

**Décision d'hébergement (15/11/2026) :** l'application ne sera pas hébergée chez Supabase. Le logiciel Supabase tourne dans Docker, en local pour le développement (`pnpm db:start`) puis sur un serveur à choisir. Conséquence : sauvegardes, mises à jour, supervision et envoi des e-mails (serveur SMTP) seront à notre charge en production.

## 4. Schéma de base de données

**Construit et testé** (`supabase/migrations/20261115000000_foundations.sql`) :

| Table | Rôle |
|---|---|
| `profiles` | Profil lié au compte (créé automatiquement à l'inscription) |
| `households`, `household_members` | Foyers et rôles `admin` / `member` / `guest` |
| `categories` | Catégories, avec leur **base de comparaison** (`per_wash`, `per_litre`, `per_kg`, `per_unit`) et une base de secours |
| `brands` | Marques nationales et marques de distributeur |
| `products` | Produits : code-barres, quantité, nombre de lots, nombre d'utilisations |
| `retailers`, `stores` | Enseignes et magasins (code postal, coordonnées, identifiant OpenStreetMap) |
| `data_sources` | Origine de chaque donnée, avec sa licence |
| `price_observations` | Chaque relevé : produit, magasin, date, prix, **quantité du jour**, promotion, source, méthode, confirmations, statut de validation, preuve |
| `favorites`, `user_stores` | Favoris et magasins habituels |

**Prévu, migrations suivantes** : `inventory_locations`, `inventory_items`, `consumption_events` (stocks) ; `shopping_lists`, `shopping_list_items` (courses) ; `receipts`, `receipt_lines` (tickets en attente de validation) ; `observation_votes`, `reports`, `badges`, `user_points` (communauté) ; `ai_usage`, `ai_quotas` (coûts IA) ; `subscriptions` (Premium, après validation du modèle tarifaire) ; `consents`, `data_export_requests` (RGPD).

## 5. Relations principales

- `auth.users 1─1 profiles` ; supprimer le compte supprime en cascade profil, favoris, foyers créés, appartenances.
- `households N─N profiles` via `household_members` (rôle par membre). Stocks et listes appartiendront à un foyer.
- `categories 1─N products N─1 brands`.
- `retailers 1─N stores`.
- `price_observations N─1 products`, `N─1 stores`, `N─1 data_sources`, `N─1 profiles` (auteur). À la suppression d'un compte, le relevé est conservé mais **anonymisé** (`submitted_by` passe à `null`).

Règles d'accès (testées) : catalogue et prix validés lisibles sans compte ; données personnelles visibles de leur seul propriétaire ; un foyer visible de ses seuls membres ; un utilisateur ne peut soumettre un prix qu'en son nom, **en attente de validation**, et ne peut ni le valider, ni le modifier, ni le supprimer.

## 6. API et services

| Service | Mécanisme | État |
|---|---|---|
| Lecture catalogue, prix, magasins | Requêtes Supabase directes, protégées par RLS | Schéma prêt, non branché |
| Authentification | Supabase Auth auto-hébergé (e-mail + mot de passe, code par e-mail, Google, Apple) | À brancher ; Google et Apple exigent des identifiants développeur |
| Soumission d'un prix | Insertion RLS → file `pending` | Règles prêtes |
| Validation des contributions | Fonction serveur : doublons, valeurs aberrantes, recoupement | À faire |
| Import des sources ouvertes | Tâche planifiée à partir des *dumps* (pas d'appels API en masse) | À faire |
| Géocodage ville / code postal | Géoplateforme (IGN), sans clé | À faire |
| OCR tickets, reconnaissance photo | Fonction serveur + modèle de vision, résultat soumis à validation | Phase 4 |
| Assistant | Fonction serveur, outils = fonctions de `packages/core` | Phase 4 |
| Quotas et coûts IA | Table `ai_usage`, plafond par utilisateur et par jour | Phase 4 |

## 7. Prix et fiabilité

**Construit et testé** dans `packages/core`.

**Quatre natures de prix, jamais confondues :**

| Statut | Règle | Affichage |
|---|---|---|
| Confirmé | Relevé de 7 jours au plus, par ticket ou flux distributeur, ou recoupé par 2 confirmations | Vert, point plein |
| Constaté | Relevé réel de 30 jours au plus | Neutre |
| Ancien | Relevé réel de plus de 30 jours | Grisé, **hors classement** |
| Estimation | Calculé, jamais relevé | Bleu, contour pointillé, **hors classement** |

**Confiance** = fiabilité de la méthode (ticket 0,90 · étiquette 0,80 · signalement 0,55 · saisie 0,50 · estimation 0,30) + 0,08 par confirmation (3 au plus), multipliée par une décroissance de demi-vie 30 jours.

**Prix unitaire** selon la catégorie : lessive au lavage, sacs à l'unité, liquides au litre. Si la donnée manque, la base de secours s'applique ; sinon le résultat est « incalculable », jamais une valeur inventée. Deux produits ne sont classés ensemble que s'ils partagent la même base.

**Évaluation d'une offre**, comparée à l'historique réel du même produit dans le même magasin :

- *Faux prix barré* : le prix de référence annoncé dépasse le plus bas prix des 30 jours précédents (c'est la règle légale française, article L112-1-1 du Code de la consommation).
- *Prix gonflé avant promotion* : hausse d'au moins 5 % dans les 3 semaines précédentes, puis « promotion » qui revient au niveau d'avant.
- *Réduflation* : quantité réduite à prix affiché constant.
- *Réduction sans intérêt* : moins de 3 % sous le prix habituel.
- *Vraie bonne affaire* : au moins 10 % sous le prix unitaire habituel (médiane sur 90 jours).
- *Historique insuffisant* : moins de 4 relevés ou moins de 21 jours → aucun verdict.

**Classement objectif** : uniquement des prix confirmés ou constatés, triés par prix unitaire. Aucune notion de sponsoring n'existe dans ce code ; les offres sponsorisées seront un bloc séparé et étiqueté.

**Contributions** : tout envoi entre en `pending`, avec sa preuve dans un espace privé. Il ne devient public qu'après validation, pour qu'une erreur de lecture ne pollue pas la base.

## 8. Sources de données (vérifiées en ligne le 15/11/2026)

| Source | Utilisable commercialement | Ce qu'elle apporte | Limite |
|---|---|---|---|
| Open Food Facts | Oui (ODbL : attribution + partage à l'identique des bases dérivées) | Référentiel alimentaire par code-barres | Hors périmètre entretien |
| Open Products Facts | Oui, mêmes conditions (licence à relire sur sa propre page) | Produits non alimentaires | **Très mince** : environ 700 produits ménagers et 360 lessives dans le monde |
| Open Prices | Oui (ODbL) ; licence des photos de preuve non précisée | Environ 220 000 prix en France, lecture et écriture par API | Quasi exclusivement alimentaire |
| OpenStreetMap | Oui (ODbL) | Localisation des magasins | Nominatim et Overpass publics interdits comme backend : il faut un extrait hébergé |
| Géoplateforme (IGN) | Oui, 50 requêtes/s, sans clé | Géocodage ville / code postal | Clause commerciale des CGU à relire |
| SIRENE | Oui (Licence Ouverte 2.0) | Liste des établissements | — |
| API des distributeurs | **Aucune API publique de prix trouvée** | — | Le scraping est écarté (droit *sui generis* des bases de données, CPI L342-1 ; précédent LeBonCoin 2021) |
| GS1 France | Non confirmé | Données produit officielles | À instruire par contact commercial |

**Conséquence assumée :** aucune source ouverte ne fournit de prix de produits d'entretien en volume. Au lancement, les prix viendront des utilisateurs (étiquettes, tickets) et, si possible, d'accords avec des enseignes. C'est le principal risque du projet.

## 9. Phases

| Phase | Contenu | État |
|---|---|---|
| 1. Conception | Architecture, modèle de données, design system, stratégie de tests | **Fait** |
| 2. Fondations | Monorepo, web, mobile, navigation, design system, schéma SQL et RLS, catalogue | **Fait**, sauf authentification et base démarrée (Docker Desktop requis) |
| 3. MVP | Accueil, recherche, fiche, prix unitaire, comparaison, historique : **faits sur données fictives**. Restent : scanner caméra, favoris, localisation, magasins réels, comptes, branchement Supabase, premières données réelles |
| 4. Avancé | OCR tickets, reconnaissance photo, stocks prédictifs, listes, assistant, communauté, foyers, statistiques, Premium | À faire |
| 5. Qualité et lancement | Tests de bout en bout, audit de sécurité et d'accessibilité, performance, publication sur les stores | À faire |

## 10. Risques

1. **Données de prix** (critique) : pas de source ouverte pour l'entretien. Il faut amorcer une communauté dans une zone restreinte avant d'élargir.
2. **Identification des produits** : beaucoup de codes-barres d'entretien sont absents des bases ouvertes ; les utilisateurs devront créer des fiches, avec modération.
3. **OCR des tickets** : libellés abrégés propres à chaque enseigne ; l'association ligne ↔ produit demandera une validation humaine au début.
4. **Qualité des contributions** : fraude et erreurs ; d'où la file de validation, les confirmations et l'historique des validations.
5. **Juridique** : partage à l'identique ODbL, RGPD (tickets = données personnelles), règles des stores, mineurs. Un avis juridique est nécessaire avant le lancement public.
6. **Coûts d'IA** : à contenir par des quotas dès le premier jour.
7. **Versions très récentes** (Next.js 16, Expo 58) : API en évolution ; les versions sont figées dans le fichier de verrouillage.

## 11. Complexité et coûts d'exploitation

Hypothèses : lancement en France, 10 000 utilisateurs actifs par mois, 50 000 relevés par mois, 20 000 tickets analysés par mois, assistant plafonné à 10 messages par jour en version gratuite. **Les montants sont des ordres de grandeur à vérifier sur les grilles tarifaires en vigueur ; ce ne sont pas des devis.**

| Poste | Ordre de grandeur mensuel |
|---|---|
| Serveur pour Supabase auto-hébergé (4 à 8 Go de mémoire) + sauvegardes | 20 à 100 € |
| Hébergement web | 0 à 20 € |
| Compilation et mises à jour mobiles (EAS) | 0 à 100 € |
| IA : OCR de tickets (modèle de vision économique) | 50 à 300 € |
| IA : assistant (dépend entièrement des quotas) | 100 à 1 000 € |
| Comptes développeur Apple et Google | environ 10 € (frais annuels lissés) |
| **Total** | **environ 200 à 1 500 € par mois** |

Complexité : les phases 1 à 3 sont un travail de quelques semaines pour un développeur expérimenté. La phase 4 représente plusieurs mois, l'OCR et la modération étant les deux chantiers les plus lourds. Le coût dominant n'est pas technique : c'est l'acquisition de données de prix fiables.
