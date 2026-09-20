# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.23.2

FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends --yes python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ARG DAILY_UID=10001
ARG DAILY_GID=10001

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=5174 \
  DATABASE_URL=/var/lib/daily/daily.db \
  BACKUP_DIRECTORY=/var/backups/daily \
  MIGRATIONS_DIRECTORY=/app/drizzle

WORKDIR /app

RUN groupadd --gid "${DAILY_GID}" daily \
  && useradd --uid "${DAILY_UID}" --gid "${DAILY_GID}" --home-dir /nonexistent \
    --no-create-home --shell /usr/sbin/nologin daily \
  && install --directory --owner="${DAILY_UID}" --group="${DAILY_GID}" --mode=0750 \
    /var/lib/daily /var/backups/daily

COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/build ./build
COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/node_modules ./node_modules
COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/drizzle ./drizzle
COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/package.json ./package.json
COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/scripts/validate-production-environment.mjs ./scripts/validate-production-environment.mjs
COPY --from=build --chown=${DAILY_UID}:${DAILY_GID} /app/scripts/container-healthcheck.mjs ./scripts/container-healthcheck.mjs

USER ${DAILY_UID}:${DAILY_GID}

EXPOSE 5174
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "scripts/container-healthcheck.mjs"]

CMD ["node", "build"]
