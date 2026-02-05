FROM node:21-alpine AS base
WORKDIR /app
RUN corepack enable
ARG PNPM_VERSION=10.28.1

# --------------------------
# deps (all deps incl dev)
# --------------------------
FROM base AS deps
ENV CI=true
COPY . .
RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm install --frozen-lockfile

# --------------------------
# build (compile)
# --------------------------
FROM base AS build
ENV CI=true
COPY --from=deps /app /app

RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm --filter @cpt/db generate \
  && pnpm --filter @cpt/db build \
  && pnpm --filter api build

# --------------------------
# prod-deps (prod deps only)
# --------------------------
FROM base AS prod-deps
ENV CI=true
COPY . .
RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm install --prod --frozen-lockfile \
  && pnpm --filter @cpt/db generate

# --------------------------
# runner (runtime)
# --------------------------
FROM node:21-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

ARG PNPM_VERSION=10.28.1
RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

ARG GIT_SHA=unknown
ARG GIT_REF=unknown
ARG BUILD_DATE=unknown

ENV GIT_SHA=$GIT_SHA
ENV GIT_REF=$GIT_REF
ENV BUILD_DATE=$BUILD_DATE

# workspace files (needed for pnpm --filter in runtime)
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=prod-deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# COPY --from=prod-deps /app/.npmrc ./.npmrc

# prod node_modules
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/libs/db/node_modules ./libs/db/node_modules

# built artifacts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

COPY --from=build /app/libs/db/dist ./libs/db/dist
COPY --from=build /app/libs/db/package.json ./libs/db/package.json

# prisma schema + migrations
COPY --from=build /app/libs/db/prisma ./libs/db/prisma

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
