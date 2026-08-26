# ── 1. Construction de l'app web ────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── 2. Construction de l'API ────────────────────────────────────
FROM node:22-alpine AS api
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── 3. Image finale ─────────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production TZ=Europe/Paris
WORKDIR /app
RUN apk add --no-cache tzdata tini
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api /build/server/dist ./dist
COPY --from=web /build/web/dist ./web-dist
ENV WEB_DIST=/app/web-dist UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
