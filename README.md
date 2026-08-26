# Garde‑Manger

Le stock de la maison, les dates de péremption, et rien de plus.

Application web installable (PWA) pour un foyer : on scanne un produit, on renseigne
sa date, on sait où il se trouve, on voit ce qui expire bientôt, et on retire d'un
geste ce qui a été consommé. Interface en français, pensée d'abord pour l'iPhone.

- **App** — React + TypeScript, Vite, service worker (installable sur l'écran d'accueil).
- **API** — Node 22 + Express, sessions par cookie, PostgreSQL 16.
- **Déploiement** — Docker Compose : `db` + `app` + `proxy` (Caddy, HTTPS automatique) + `backup`.

---

## Les cinq gestes centraux

| Geste | Où |
|---|---|
| Scanner un produit | Bouton orange, présent sur tous les écrans |
| Renseigner sa date | Écran d'ajout : raccourcis (3 j, 1 semaine, 1 mois) ou date exacte |
| Savoir où il est | Emplacement obligatoire, filtres et compteurs par emplacement |
| Voir ce qui expire | Accueil (« À consommer vite ») et onglet Dates |
| Retirer ce qui est consommé | « −1 consommé » directement dans les listes, avec Annuler |

Tout le reste — catégories, historique, pharmacie, congélateur, export — reste au
service de ces cinq actions.

---

## Démarrage rapide (Docker)

```bash
cp .env.example .env
```

Éditez `.env` : au minimum `POSTGRES_PASSWORD`, `HOUSEHOLD_PASSWORD` (8 caractères
minimum) et `DOMAIN`. Puis :

```bash
docker compose up -d --build
```

L'app est servie sur `https://$DOMAIN`. Au premier démarrage l'API crée la base, le
foyer, six emplacements (Frigo, Congélateur, Placard, Pharmacie, Cellier, Cave) et
huit catégories. `HOUSEHOLD_PASSWORD` n'est lu qu'à cette création : ensuite le mot
de passe se change depuis **Réglages › Sécurité**.

Suivre les journaux :

```bash
docker compose logs -f app
```

### Domaine et certificat

- `DOMAIN` pointe vers un vrai domaine public → Caddy obtient un certificat
  Let's Encrypt tout seul (ports 80 et 443 doivent être joignables).
- `DOMAIN=localhost` ou un nom de réseau local → Caddy émet un certificat interne.
  Le navigateur avertira une fois ; c'est suffisant pour un usage domestique, mais
  **iOS n'autorise la caméra qu'en HTTPS**, d'où le proxy même à la maison.

---

## Installer sur l'iPhone

1. Ouvrir `https://votre-domaine` dans **Safari** (pas Chrome : seul Safari installe
   les PWA sur iOS).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Lancer l'app depuis l'icône : elle s'ouvre en plein écran, sans barre Safari.
4. Au premier scan, iOS demande l'accès à la caméra — accepter.

La session dure `SESSION_DAYS` jours (180 par défaut) : on ne ressaisit pas le mot de
passe à chaque ouverture.

---

## Développement local

Nécessite Node 22 et un PostgreSQL accessible.

```bash
createdb gardemanger_dev
cd server && npm install && cd ../web && npm install && cd ..
```

Créer `.env.dev` :

```
DATABASE_URL="postgres://VOTRE_USER@127.0.0.1:5432/gardemanger_dev"
HOUSEHOLD_NAME="Maison"
HOUSEHOLD_PASSWORD="mot-de-passe-de-dev"
COOKIE_SECURE="false"
NODE_ENV="development"
PORT="3001"
TZ="Europe/Paris"
UPLOADS_DIR="./.data/uploads"
```

Puis :

```bash
./scripts/dev.sh
```

L'API écoute sur `:3001`, l'app sur `:5173` (les requêtes `/api` y sont relayées).
La caméra ne fonctionne qu'en HTTPS ou sur `localhost` — pour tester le scan depuis
un téléphone, passez par `docker compose` avec le proxy.

Vérifications :

```bash
cd server && npm run typecheck
cd web && npm run typecheck && npm run build
```

---

## Modèle de données

Deux tables portent l'essentiel :

- **`product`** — la fiche : nom, marque, code‑barres, catégorie, photo, et pour la
  pharmacie dosage et forme. Une fiche par code‑barres et par foyer.
- **`batch`** — un lot : quantité, emplacement, type de date, date, lot, ouverture,
  congélation. **Plusieurs lots par produit** : 4 yaourts qui expirent vendredi et
  8 la semaine suivante sont deux lignes distinctes, sans mélanger leurs dates.

Autour : `location`, `category` (personnalisables, réordonnables), `movement`
(historique : ajouté, consommé, jeté, déplacé, ouvert, congelé, décongelé…),
`barcode_cache` (mémoire des codes déjà vus), `shopping_item`, `session`,
`login_attempt`.

La vue `batch_effective` calcule la **date effective** d'un lot : pour un produit
ouvert « à consommer sous X jours », c'est la plus proche entre la DLC imprimée et
`ouverture + X jours`. C'est cette date qui pilote partout le code couleur.

### Code couleur d'urgence

| Tranche | Couleur |
|---|---|
| Expiré | rouge |
| Aujourd'hui | rouge |
| 1 à 3 jours | orange |
| 4 à 7 jours | jaune |
| Au‑delà | neutre / vert |
| Sans date | gris |

---

## Identification des produits

À chaque scan, dans cet ordre :

1. **Le stock du foyer** — le produit est déjà connu : ajout en deux gestes, scan
   puis Sauvegarder.
2. **Le cache local** des codes déjà rencontrés — pas d'appel réseau.
3. **Open Food Facts** — nom, marque, photo, conditionnement ; le résultat est mis
   en cache pour les fois suivantes.

Si rien ne répond, on nomme le produit une fois : il est mémorisé et reconnu ensuite.

Les boîtes de médicaments portent un **DataMatrix GS1** : l'app en extrait le code
produit (AI 01), la péremption (AI 17) et le numéro de lot (AI 10), qui pré‑remplissent
le formulaire.

L'écran **Scanner la date** fige une photo de l'emballage et propose les dates
trouvées dans la mention recopiée (« À consommer jusqu'au 02/09/2026 » → 2026‑09‑02,
type DLC). Rien n'est enregistré sans confirmation : une date mal lue est pire qu'une
date absente. La reconnaissance optique automatique reste à faire.

---

## Sécurité

- Un seul compte partagé « Maison », mot de passe haché en **scrypt** (sel aléatoire,
  N = 32768) — aucune dépendance native à compiler.
- Sessions en cookie `HttpOnly` + `Secure` + `SameSite=Lax` ; seul le SHA‑256 du jeton
  est stocké. Déconnexion d'un appareil, de cet appareil, ou de tous.
- **8 tentatives ratées par IP → blocage 15 minutes.**
- Validation de toutes les entrées côté serveur (Zod), en‑têtes `helmet` + CSP,
  HSTS posé par le proxy.
- PostgreSQL n'est jamais publié : aucun port mappé, il n'existe que sur le réseau Docker.
- Les photos ajoutées à la main sont réduites côté téléphone puis stockées sur le
  volume `app-data`, jamais chez un tiers.

---

## Sauvegardes

Le service `backup` produit chaque nuit à 3 h un `pg_dump` au format `custom` et une
archive des photos dans `./backups`, avec `BACKUP_KEEP_DAYS` jours de rétention.

Sauvegarde immédiate :

```bash
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > backups/manuel.dump
```

Restauration :

```bash
./scripts/restore.sh backups/db-2026-08-26_0300.dump
```

Les volumes `db-data` et `app-data` survivent aux `docker compose up --build` : les
produits, le compte et les sessions restent en place après une mise à jour.

Export ponctuel en CSV (séparateur `;`, lisible par Excel FR) :
**Réglages › Export CSV**, ou `GET /api/export.csv`.

---

## API

Tout est sous `/api`, en JSON, authentifié par le cookie de session sauf
`/api/auth/login` et `/api/health`.

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/auth/login` · `/auth/logout` · `/auth/logout-all` | Connexion, déconnexion |
| `GET` | `/auth/me` · `/auth/sessions` | Session courante, appareils connectés |
| `POST` | `/auth/password` | Changer le mot de passe du foyer |
| `GET` | `/dashboard` | Compteurs, urgents, emplacements |
| `GET` | `/stock` | Liste filtrée (`q`, `bucket`, `location`, `category`, `opened`, `sort`) |
| `GET` | `/stock/:batchId` | Un lot, ses lots frères, son historique |
| `POST` `PATCH` `DELETE` | `/products[/:id]` | Fiches produit |
| `POST` `PATCH` `DELETE` | `/batches[/:id]` | Lots |
| `POST` | `/batches/:id/consume` · `/close` · `/reopen` | −1, jeté/terminé, annulation |
| `POST` | `/batches/:id/open` · `/move` · `/thaw` | Ouverture, déplacement, décongélation |
| `GET` | `/lookup/:barcode` | Stock → cache → Open Food Facts |
| `GET` | `/recent-products` | Ajout rapide des articles habituels |
| `POST` | `/parse-date` | Dates trouvées dans un texte |
| `GET` | `/movements` · `/export.csv` | Historique, export |
| `GET` `POST` `PATCH` `DELETE` | `/locations` · `/categories` · `/shopping` | Personnalisation, courses |
| `POST` | `/uploads` | Photo produit (JPEG/PNG/WebP, 5 Mo max) |

---

## Reste à faire

Volontairement laissé de côté pour l'instant, dans l'ordre où ça vaudra le coup :

- **Notifications de péremption** — résumé quotidien des produits à consommer.
- **OCR automatique des dates** — l'écran existe et la détection dans le texte
  fonctionne ; il manque la reconnaissance dans l'image.
- **Décongélation guidée** — proposer une nouvelle échéance à la sortie du congélateur.
- **File d'attente hors ligne** — aujourd'hui l'app prévient qu'elle est hors ligne
  et les écritures sont à refaire ; elles pourraient être rejouées à la reconnexion.

---

## Origine

L'interface vient du canevas Claude Design *Garde‑Manger*, conservé dans `design/`
comme référence : douze écrans, iOS sombre, accent `#F5A623`.
