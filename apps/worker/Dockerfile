# apps/worker/Dockerfile
FROM node:21-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app /app
RUN pnpm --filter @cpt/db generate
RUN pnpm --filter @cpt/db build
RUN pnpm --filter worker build

FROM node:21-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/libs/db/node_modules ./libs/db/node_modules

COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/libs/db/dist ./libs/db/dist
COPY --from=build /app/libs/db/package.json ./libs/db/package.json

EXPOSE 3001
CMD ["node", "apps/worker/dist/main.js"]
