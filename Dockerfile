# syntax=docker/dockerfile:1.7

# --- deps: install workspace dependencies once -------------------------------
FROM node:24-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# --- build: compile every workspace package ----------------------------------
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /repo/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /repo/packages/web/node_modules ./packages/web/node_modules
COPY . .
RUN pnpm --filter @lxi-web/core build \
    && pnpm --filter @lxi-web/server build \
    && pnpm --filter @lxi-web/web build

# Produce a self-contained deployment tree (prod node_modules + dist) for the
# server. `pnpm deploy` resolves workspace: links to local copies so the
# distroless stage does not need a workspace layout.
RUN pnpm deploy --legacy --filter=@lxi-web/server --prod /deploy/server \
    && cp -r packages/web/dist /deploy/server/web-dist

# --- runtime: distroless, nonroot -------------------------------------------
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /deploy/server /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    WEB_DIST=/app/web-dist \
    LOG_LEVEL=info
EXPOSE 8787
USER nonroot
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:8787/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["dist/index.js"]
