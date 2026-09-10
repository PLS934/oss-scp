FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/mock-api/package.json ./apps/mock-api/package.json
RUN pnpm install --frozen-lockfile
COPY apps/mock-api ./apps/mock-api
COPY fixtures ./fixtures
RUN pnpm --filter @oss-scp/mock-api build \
    && pnpm --filter @oss-scp/mock-api deploy --prod /out

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production MOCK_HOST=0.0.0.0 MOCK_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=5s --start-period=10s --retries=6 CMD ["node", "healthcheck.mjs"]
CMD ["node", "dist/main.js"]
