# syntax=docker/dockerfile:1.7

# @file Dockerfile
# @version 1.0.3
# @date 2026-10-23
# @description Собирает общий runtime образ приложения и штатного Media worker.

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS base

RUN npm install --global npm@11.15.0

FROM base AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SERVER_URL="" \
    NEXT_PUBLIC_SITE_URL="" \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="" \
    REALIZE_BUILD_WITHOUT_DATABASE=true

COPY package.json package-lock.json .npmrc ./
COPY packages ./packages
COPY scripts/runtime/verify-runtime.mjs ./scripts/runtime/verify-runtime.mjs
COPY scripts/runtime/readProjectRuntime.config.mjs scripts/runtime/verifyProjectRuntimePins.service.mjs ./scripts/runtime/
COPY scripts/runtime/patches ./scripts/runtime/patches
RUN npm run verify:runtime -- --runtime-only && npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && rm -rf .next/standalone/node_modules

FROM base AS runtime

WORKDIR /app

ENV HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000

RUN groupadd --gid 1001 realize \
  && useradd --uid 1001 --gid realize --create-home --shell /usr/sbin/nologin realize

COPY --from=build --chown=realize:realize /app/package.json /app/package-lock.json ./
COPY --from=build --chown=realize:realize /app/node_modules ./node_modules
COPY --from=build --chown=realize:realize /app/.next/standalone ./.next/standalone
COPY --from=build --chown=realize:realize /app/.next/static ./.next/standalone/.next/static
COPY --from=build --chown=realize:realize /app/public ./public
COPY --from=build --chown=realize:realize /app/public ./.next/standalone/public
COPY --from=build --chown=realize:realize /app/src ./src
COPY --from=build --chown=realize:realize /app/packages ./packages
COPY --from=build --chown=realize:realize /app/scripts/runtime ./scripts/runtime
COPY --from=build --chown=realize:realize /app/next.config.ts /app/tsconfig.json ./

RUN mkdir -p /app/.data/media /app/public/media \
  && chown -R realize:realize /app/.data /app/public/media \
  && rm -rf .next/standalone/public/media \
  && ln -s /app/public/media .next/standalone/public/media

USER realize

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]
