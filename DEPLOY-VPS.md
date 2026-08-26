# Déploiement production — VPS aydev

Cette branche **`prod`** adapte garde-manger au VPS `aydev` : le TLS et le
routage sont assurés par le **Traefik** déjà en place (compose racine
`/root/aydev/docker-compose.yml`), pas par le Caddy embarqué de la branche `dev`.

## Ce qui change par rapport à `dev`

| | `dev` (local) | `prod` (VPS) |
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

## Mise en service

```bash
cd /root/aydev/garde-manger
git checkout prod
cp .env.prod.example .env      # puis renseigner les secrets
docker compose up -d --build
docker compose logs -f app     # suivre le 1er démarrage (migrations + seed)
```

Traefik détecte le conteneur `garde-manger-app` (label `traefik.enable=true`),
publie `https://garde-manger.aydev.app` et obtient le certificat automatiquement.

## Mettre à jour après un push

```bash
cd /root/aydev/garde-manger
git pull origin prod
docker compose up -d --build
```

## Sauvegardes / restauration

- Dumps quotidiens PostgreSQL dans `./backups` (rétention `BACKUP_KEEP_DAYS`).
- Restauration : `scripts/restore.sh <fichier.sql.gz>`.
