# --------------------------
# Base (shared)
# --------------------------
FROM node:21-alpine AS base
WORKDIR /app

# Corepack is bundled with Node, enable it (gives us pnpm via corepack prepare)
RUN corepack enable

# Pin pnpm version for reproducible builds (update to your real version)
ARG PNPM_VERSION=10.28.1

# --------------------------
# deps (install all deps)
# --------------------------
FROM base AS deps
ENV CI=true

# Copy everything to resolve workspace dependencies correctly
COPY . .

# Activate pinned pnpm and install (includes dev deps - needed for build)
RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm install --frozen-lockfile

# --------------------------
# build (compile)
# --------------------------
FROM base AS build
ARG PNPM_VERSION=10.28.1

COPY --from=deps /app /app

# Build db + api
RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm --filter @cpt/db generate \
  && pnpm --filter @cpt/db build \
  && pnpm --filter api build

# Optional but recommended: remove devDependencies before copying to runner
RUN corepack prepare pnpm@${PNPM_VERSION} --activate \
  && pnpm prune --prod

# --------------------------
# runner (production runtime)
# --------------------------
FROM node:21-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

ARG PNPM_VERSION=10.28.1

# Activate pnpm in runtime image (so migrations can run via pnpm)
RUN corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

# --- Workspace files (needed for pnpm --filter in runtime) ---
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# If you use .npmrc for registry/auth or node-linker settings, copy it too:
# COPY --from=build /app/.npmrc ./.npmrc

# --- Dependencies (already pruned to prod in build stage) ---
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/libs/db/node_modules ./libs/db/node_modules

# --- Built artifacts ---
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

COPY --from=build /app/libs/db/dist ./libs/db/dist
COPY --from=build /app/libs/db/package.json ./libs/db/package.json

# --- Prisma schema + migrations (IMPORTANT for migrate deploy) ---
COPY --from=build /app/libs/db/prisma ./libs/db/prisma

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
