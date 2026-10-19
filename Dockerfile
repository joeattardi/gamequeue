# Multi-stage build; works for linux/arm64 (Raspberry Pi) and linux/amd64.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# Build tools are only a fallback for native modules without a prebuilt binary
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build
# Production-only dependencies for the server (shared is inlined by tsup)
RUN rm -rf node_modules && npm ci --omit=dev --workspace @gamequeue/server --include-workspace-root=false

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/gamequeue.db
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
RUN mkdir /data && chown node:node /data
USER node
# The app resolves the web build (../web/dist) relative to the working directory
WORKDIR /app/apps/server
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]
