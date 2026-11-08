FROM --platform=$BUILDPLATFORM node:22-alpine AS build
RUN npm install -g --no-audit --no-fund pnpm@12.16.1
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY tests/e2e/package.json tests/e2e/
COPY apps/web apps/web
RUN pnpm install --offline --frozen-lockfile --filter @bamboo/web...
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=bms
ARG VITE_KEYCLOAK_CLIENT=bms-web
ARG VITE_HASURA_URL=http://localhost:8081/v1/graphql
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT=$VITE_KEYCLOAK_CLIENT VITE_HASURA_URL=$VITE_HASURA_URL
RUN pnpm --filter @bamboo/web build
WORKDIR /repo/apps/web
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
      -size +1k -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

FROM nginxinc/nginx-unprivileged:1.30-alpine
LABEL org.opencontainers.image.title="bamboo-web" \
      org.opencontainers.image.description="Bamboo DX-OS: ứng dụng Refine (Tầng 2) phục vụ bằng nginx" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 apps/web/docker/40-bamboo-config.sh /docker-entrypoint.d/40-bamboo-config.sh
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
