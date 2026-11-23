# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
RUN sed -i 's/\r$//' apps/web/docker/40-bamboo-config.sh apps/web/nginx.conf
WORKDIR /repo/apps/web
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) \
      -size +1k -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;

FROM nginxinc/nginx-unprivileged:1.30-alpine
LABEL org.opencontainers.image.title="bamboo-web" \
      org.opencontainers.image.description="Bamboo: ứng dụng Refine (Tầng 2) phục vụ bằng nginx" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build /repo/apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chmod=0755 /repo/apps/web/docker/40-bamboo-config.sh /docker-entrypoint.d/40-bamboo-config.sh
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
