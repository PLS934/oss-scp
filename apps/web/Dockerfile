FROM node:24.19.0-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.5
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web ./apps/web
RUN pnpm --filter @oss-scp/web build

FROM nginxinc/nginx-unprivileged:1.30.1-alpine AS runtime
ENV API_UPSTREAM=api:3000 NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
