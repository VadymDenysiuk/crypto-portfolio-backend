# apps/api/Dockerfile
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
RUN pnpm --filter api build

FROM node:21-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/libs/db/node_modules ./libs/db/node_modules

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/libs/db/dist ./libs/db/dist
COPY --from=build /app/libs/db/package.json ./libs/db/package.json

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
