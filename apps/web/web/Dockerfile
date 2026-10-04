# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Ứng dụng Refine: build tĩnh bằng Node 22 (react-router 7 cần Node >= 20), phục vụ bằng nginx.
# Địa chỉ Keycloak/Hasura gắn vào bundle lúc build (biến VITE_*, mặc định stack docker compose).
FROM node:22-alpine AS build
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

# nginx nhánh stable, chạy không cần root.
FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
