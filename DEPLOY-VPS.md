# Déploiement production — VPS aydev

La branche **`main`** est la branche de **production** : le TLS et le routage
sont assurés par le **Traefik** déjà en place (compose racine
`/root/aydev/docker-compose.yml`), pas par le Caddy embarqué de la branche `dev`.
Tout push sur `main` redéploie automatiquement (voir `.github/workflows/deploy.yml`).

## Ce qui change par rapport à `dev`

| | `dev` (local) | `main` (VPS / prod) |
|---|---|---|
| Reverse-proxy | Caddy embarqué (ports 80/443) | Traefik du VPS (labels) |
| Réseau | par défaut | externe `aydev_aydev-net` |
| TLS | Let's Encrypt via Caddy / cert interne | Let's Encrypt via Traefik |
| Sécurité conteneur | standard | durci (cap_drop, tmpfs noexec, mem_limit, no-new-privileges) |
| Domaine | `DOMAIN` (localhost par défaut) | `garde-manger.aydev.app` (dans les labels) |

## Prérequis

- Traefik lancé (`docker compose -p aydev up -d traefik`) et réseau
  `aydev_aydev-net` présent.
- DNS `garde-manger.aydev.app` → IP du VPS (déjà en place).

## Mise en service (première fois)

```bash
cd /root/aydev/garde-manger
git checkout main
cp .env.prod.example .env      # puis renseigner les secrets
docker compose up -d --build
docker compose logs -f app     # suivre le 1er démarrage (migrations + seed)
```

Traefik détecte le conteneur `garde-manger-app` (label `traefik.enable=true`),
publie `https://garde-manger.aydev.app` et obtient le certificat automatiquement.

## Mise à jour (flux normal)

Le déploiement est **automatique** : il suffit de pousser sur `main`.

```bash
git push origin main   # → GitHub Actions redéploie sur le VPS
```

Redéploiement manuel sur le VPS si besoin :

```bash
cd /root/aydev/garde-manger
git pull origin main
docker compose up -d --build
```

## Sauvegardes / restauration

- Dumps quotidiens PostgreSQL dans `./backups` (rétention `BACKUP_KEEP_DAYS`).
- Restauration : `scripts/restore.sh <fichier.sql.gz>`.
