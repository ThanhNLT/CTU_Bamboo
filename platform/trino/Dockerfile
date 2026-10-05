# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Trino cho Lakehouse (ADR #40): cấu hình một node, catalog Iceberg đọc từ tệp do openbao-init ghi
# (/etc/trino/bms-catalog, có mật khẩu và khóa S3), view silver sinh sẵn (silver.sql) cho job trino-init.
FROM trinodb/trino:483
LABEL org.opencontainers.image.title="bamboo-trino" \
      org.opencontainers.image.description="Bamboo DX-OS: Trino truy vấn Lakehouse (Iceberg bronze/silver)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=trino:trino config.properties jvm.config /etc/trino/
COPY --chown=trino:trino silver.sql /etc/trino/bms/silver.sql
