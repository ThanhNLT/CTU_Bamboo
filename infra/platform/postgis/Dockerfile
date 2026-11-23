# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

# PostgreSQL 17 + PostGIS 3 đa kiến trúc (amd64, arm64). Image postgis/postgis chỉ phát hành amd64: trên Mac Apple
# Silicon phải chạy qua giả lập (chậm, dễ treo khi initdb). Image này dựng từ postgres chính thức (đa kiến trúc) và
# gói postgresql-17-postgis-3 của kho PGDG đã cấu hình sẵn trong image gốc, nên chạy native trên Mac, Windows, Linux.
FROM postgres:17-bookworm
# Để trống: bản PostGIS 3.x mới nhất của PGDG. Ghim khi cần, ví dụ --build-arg POSTGIS_VERSION='3.6.*'
ARG POSTGIS_VERSION=
LABEL org.opencontainers.image.title="bamboo-db" \
      org.opencontainers.image.description="Bamboo DX-OS: PostgreSQL 17 + PostGIS 3 (amd64, arm64)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
RUN set -eux; apt-get update; \
    v="${POSTGIS_VERSION:+=$POSTGIS_VERSION}"; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      "postgresql-$PG_MAJOR-postgis-3$v" "postgresql-$PG_MAJOR-postgis-3-scripts$v"; \
    rm -rf /var/lib/apt/lists/*
COPY 10_postgis.sh /docker-entrypoint-initdb.d/10_postgis.sh
# Bỏ CRLF (bản clone Windows) và bỏ quyền chạy: entrypoint phải `source` script để có mảng psql của nó
RUN sed -i 's/\r$//' /docker-entrypoint-initdb.d/10_postgis.sh && chmod 0644 /docker-entrypoint-initdb.d/10_postgis.sh
