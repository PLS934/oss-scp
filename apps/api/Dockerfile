FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/collector-cli/package.json ./apps/collector-cli/package.json
COPY packages/collection-engine/package.json ./packages/collection-engine/package.json
COPY packages/csv-reader/package.json ./packages/csv-reader/package.json
COPY packages/http-collector/package.json ./packages/http-collector/package.json
COPY packages/local-csv-source/package.json ./packages/local-csv-source/package.json
COPY packages/platform-db/package.json ./packages/platform-db/package.json
COPY packages/plugin-config/package.json ./packages/plugin-config/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY plugins/sample1-offset-api/package.json ./plugins/sample1-offset-api/package.json
COPY plugins/sample2-single-api/package.json ./plugins/sample2-single-api/package.json
COPY plugins/vulnerabilities-local-csv/package.json ./plugins/vulnerabilities-local-csv/package.json
COPY plugins/vulnerabilities-http-csv/package.json ./plugins/vulnerabilities-http-csv/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api ./apps/api
COPY apps/collector-cli ./apps/collector-cli
COPY packages ./packages
COPY plugins ./plugins
COPY connections ./connections
COPY fixtures/csv ./fixtures/csv
RUN pnpm build:plugin-transforms \
    && pnpm --filter @oss-scp/collector-cli build \
    && pnpm --filter @oss-scp/api build \
    && pnpm --filter @oss-scp/api deploy --prod /out

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /workspace/plugins/registry.json ./plugins/registry.json
COPY --from=build --chown=node:node /workspace/plugins/sample1-offset-api/plugin.json /workspace/plugins/sample1-offset-api/source.json /workspace/plugins/sample1-offset-api/package.json ./plugins/sample1-offset-api/
COPY --from=build --chown=node:node /workspace/plugins/sample1-offset-api/dist/transform.js ./plugins/sample1-offset-api/dist/transform.js
COPY --from=build --chown=node:node /workspace/plugins/sample2-single-api/plugin.json /workspace/plugins/sample2-single-api/source.json /workspace/plugins/sample2-single-api/package.json ./plugins/sample2-single-api/
COPY --from=build --chown=node:node /workspace/plugins/sample2-single-api/dist/transform.js ./plugins/sample2-single-api/dist/transform.js
COPY --from=build --chown=node:node /workspace/plugins/vulnerabilities-local-csv/plugin.json /workspace/plugins/vulnerabilities-local-csv/source.json /workspace/plugins/vulnerabilities-local-csv/package.json ./plugins/vulnerabilities-local-csv/
COPY --from=build --chown=node:node /workspace/plugins/vulnerabilities-local-csv/dist/transform.js ./plugins/vulnerabilities-local-csv/dist/transform.js
COPY --from=build --chown=node:node /workspace/plugins/vulnerabilities-http-csv/plugin.json /workspace/plugins/vulnerabilities-http-csv/source.json /workspace/plugins/vulnerabilities-http-csv/package.json ./plugins/vulnerabilities-http-csv/
COPY --from=build --chown=node:node /workspace/plugins/vulnerabilities-http-csv/dist/transform.js ./plugins/vulnerabilities-http-csv/dist/transform.js
COPY --from=build --chown=node:node /workspace/connections/registry.json /workspace/connections/mock-api-sample1.json /workspace/connections/mock-api-sample2.json /workspace/connections/mock-api-vulnerabilities-csv.json ./connections/
COPY --from=build --chown=node:node /workspace/fixtures/csv ./fixtures/csv
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "healthcheck.mjs"]
CMD ["node", "dist/main.js"]
