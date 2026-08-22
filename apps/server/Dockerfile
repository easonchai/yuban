FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
RUN pnpm install --filter server... --frozen-lockfile=false
COPY apps/server/src ./apps/server/src
RUN pnpm prisma generate && pnpm --filter server build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY prisma ./prisma
COPY persona ./persona
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
ENV NODE_ENV=production
EXPOSE 8400
# local binary, NOT npx: npx consults the npm registry and hangs boot when
# the network is down. Boot must work fully offline.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node apps/server/dist/index.js"]
