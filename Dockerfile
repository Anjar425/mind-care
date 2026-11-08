# syntax=docker/dockerfile:1.7
#
# Targets:
#   runtime  (default) API server: dist + production dependencies, non-root.
#   migrator           One-shot job: applies Prisma migrations and seeds reference data.
#
# NODE_ENV stays "development" until the production profile is approved (Phase 2).
# This image is for local and CI use; do not expose it publicly yet.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
	PATH=/pnpm:$PATH \
	CI=true \
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	CHECKPOINT_DISABLE=1 \
	PRISMA_HIDE_UPDATE_MESSAGE=1
# OpenSSL is required by Prisma's schema engine (migrations); slim images omit it.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& corepack enable
WORKDIR /app

# All dependencies (build tools, Prisma CLI) for compiling and migrating.
# package.json allows the @prisma/engines build script, so the schema engine is
# downloaded here at build time (as root), not at container start.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json tsconfig.reference-seed.json nest-cli.json prisma.config.ts ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY src ./src
# prebuild runs `prisma generate`; nest build copies mail templates into dist.
RUN pnpm build && pnpm build:seed

# Production dependencies only (no Prisma CLI, no dev tooling).
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm install --frozen-lockfile --prod

FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
COPY --from=build /app/dist/reference-seed ./dist/reference-seed
USER node
# Call the Prisma CLI directly: no pnpm/corepack download at container start.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/reference-seed/scripts/seed-reference-data.js --apply"]

FROM ${NODE_IMAGE} AS runtime
# Production by default; the local compose stack sets NODE_ENV=development explicitly.
ENV NODE_ENV=production \
	PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
RUN mkdir -p /app/.private && chown node:node /app/.private
USER node
VOLUME ["/app/.private"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main"]
