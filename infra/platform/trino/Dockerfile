# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM trinodb/trino:483
LABEL org.opencontainers.image.title="bamboo-trino" \
      org.opencontainers.image.description="Bamboo DX-OS: Trino truy vấn Lakehouse (Iceberg bronze/silver)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=trino:trino config.properties jvm.config password-authenticator.properties access-control.properties /etc/trino/
COPY --chown=trino:trino silver.sql rules.json /etc/trino/bms/
COPY --chown=trino:trino --chmod=0755 start.sh /usr/lib/trino/bin/bamboo-start
# bỏ CRLF của bản clone Windows (core.autocrlf=true)
USER root
RUN sed -i 's/\r$//' /usr/lib/trino/bin/bamboo-start /etc/trino/*.properties /etc/trino/jvm.config /etc/trino/bms/silver.sql \
 && chown trino:trino /usr/lib/trino/bin/bamboo-start /etc/trino/*.properties /etc/trino/jvm.config /etc/trino/bms/silver.sql \
 && chmod 0755 /usr/lib/trino/bin/bamboo-start
USER trino
CMD ["/usr/lib/trino/bin/bamboo-start"]
