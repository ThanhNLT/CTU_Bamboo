# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=bms
ARG VITE_KEYCLOAK_CLIENT=bms-web
ARG VITE_HASURA_URL=http://localhost:8081/v1/graphql
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM \
    VITE_KEYCLOAK_CLIENT=$VITE_KEYCLOAK_CLIENT VITE_HASURA_URL=$VITE_HASURA_URL
RUN npm run build
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
      -size +1k -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

FROM nginxinc/nginx-unprivileged:1.30-alpine
LABEL org.opencontainers.image.title="bamboo-web" \
      org.opencontainers.image.description="Bamboo DX-OS: ứng dụng Refine (Tầng 2) phục vụ bằng nginx" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 docker/40-bamboo-config.sh /docker-entrypoint.d/40-bamboo-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
