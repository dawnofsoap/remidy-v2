# The production image: one Node server that also serves the built web app.
# Build from the repo root: docker build -f deploy/Dockerfile .
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS node

FROM node AS tools
# Keep in step with packageManager in package.json.
RUN npm install --global pnpm@12.18.0
ENV CI=true
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

FROM tools AS web
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
RUN pnpm install --frozen-lockfile --filter @remidy/web...
RUN pnpm --filter @remidy/web build

FROM tools AS server
COPY apps/server/package.json apps/server/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
RUN pnpm install --prod --frozen-lockfile --filter @remidy/server...
COPY apps/server/src apps/server/src
COPY packages/contracts/src packages/contracts/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations
# Tests and their helpers need packages that aren't installed here.
RUN find apps packages -path '*/node_modules' -prune -o \
    \( -name '*.test.ts' -o -name 'testing.ts' \) -exec rm {} +

FROM node
ENV NODE_ENV=production WEB_ROOT=/app/web
WORKDIR /app
# Workspace packages stay as links to their source. Node won't run TypeScript from a real folder
# inside node_modules, which is why this doesn't use pnpm deploy.
COPY --from=server /build /app
COPY --from=web /build/apps/web/dist /app/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/src/main.ts"]
