# syntax=docker/dockerfile:1.7
# =============================================================================
# SwiftShip API — production image
#
# This is the CANONICAL build path for the API (docker-compose.yml and
# .github/workflows/release.yml both build from this file). The legacy
# `nest build` -> dist/main.js + prisma/ flow is dead: the app lives in
# apps/api and is built with the Nx webpack executor
# (entry apps/api/src/main.ts -> dist/apps/api/main.js).
#
# Stages:
#   deps       - npm ci from the root lockfile (dev deps included; Nx needs them)
#   build      - nx build api (webpack bundle) + nx build typeorm (CommonJS
#                datasource + migrations, used by the entrypoint)
#   prod-deps  - npm ci --omit=dev for the slim runtime tree
#   runner     - dist/apps/api + dist/libs/platform/typeorm + prod node_modules
#
# At startup docker-entrypoint.sh runs TypeORM migrations
# (dist/libs/platform/typeorm) before exec-ing `node dist/apps/api/main.js`.
# Opt out with MIGRATIONS_ENABLED=false.
# =============================================================================

FROM node:22-alpine AS deps
# python3/make/g++: fallback toolchain for the native `bcrypt` module on musl
RUN apk add --no-cache python3 make gcc g++
WORKDIR /app
# Cache-friendly: only the manifests first, so source edits don't bust the
# dependency layer.
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
ENV NX_DAEMON=false
WORKDIR /app
COPY . .
# Webpack bundle of the API -> dist/apps/api/main.js
RUN npx nx build api
# CommonJS build of the TypeORM lib (entities + 12 migrations + DataSource
# factory). Required at runtime by docker-entrypoint.sh; it has no imports
# outside its own tree + node_modules, so it links against the prod
# node_modules (typeorm, pg, tslib are all prod deps).
RUN npx nx build typeorm

FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make gcc g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_SYNCHRONIZE=false
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist/apps/api ./dist/apps/api
COPY --from=build --chown=node:node /app/dist/libs/platform/typeorm ./dist/libs/platform/typeorm
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Guard against CRLF checkouts (Windows git autocrlf) and lost exec bits,
# then hand the tree to the unprivileged user.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
  && chmod 0755 docker-entrypoint.sh \
  && chown node:node docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/ready >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/apps/api/main.js"]
