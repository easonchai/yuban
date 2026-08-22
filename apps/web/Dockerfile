FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --filter web... --frozen-lockfile=false
COPY apps/web ./apps/web
# Rewrites are serialized into the standalone build, so the API origin must
# be known at BUILD time — runtime env cannot change it.
ARG API_ORIGIN=http://server:8400
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm --filter web build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
