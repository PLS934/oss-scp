FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/collector-cli/package.json ./apps/collector-cli/package.json
COPY packages/collection-engine/package.json ./packages/collection-engine/package.json
COPY packages/csv-reader/package.json ./packages/csv-reader/package.json
COPY packages/http-collector/package.json ./packages/http-collector/package.json
COPY packages/http-csv-source/package.json ./packages/http-csv-source/package.json
COPY packages/local-csv-source/package.json ./packages/local-csv-source/package.json
COPY packages/platform-db/package.json ./packages/platform-db/package.json
COPY packages/plugin-config/package.json ./packages/plugin-config/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api ./apps/api
COPY apps/collector-cli ./apps/collector-cli
COPY packages ./packages
RUN pnpm --filter @oss-scp/collector-cli build \
    && pnpm --filter @oss-scp/api build \
    && pnpm --filter @oss-scp/api deploy --prod /out

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "healthcheck.mjs"]
CMD ["node", "dist/main.js"]
