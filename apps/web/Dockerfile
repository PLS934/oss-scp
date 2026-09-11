FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/plugin-config/package.json ./packages/plugin-config/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY plugins/sample1-offset-api/package.json ./plugins/sample1-offset-api/package.json
COPY plugins/sample2-single-api/package.json ./plugins/sample2-single-api/package.json
COPY plugins/vulnerabilities-local-csv/package.json ./plugins/vulnerabilities-local-csv/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web ./apps/web
COPY packages/plugin-config ./packages/plugin-config
COPY packages/plugin-sdk ./packages/plugin-sdk
COPY plugins ./plugins
COPY connections ./connections
COPY fixtures ./fixtures
COPY scripts/generate-plugin-menu.mjs ./scripts/generate-plugin-menu.mjs
RUN pnpm --filter @oss-scp/web build

FROM nginxinc/nginx-unprivileged:1.30.1-alpine AS runtime
ENV API_UPSTREAM=api:3000 NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
