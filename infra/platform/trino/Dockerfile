FROM trinodb/trino:483
LABEL org.opencontainers.image.title="bamboo-trino" \
      org.opencontainers.image.description="Bamboo DX-OS: Trino truy vấn Lakehouse (Iceberg bronze/silver)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=trino:trino config.properties jvm.config password-authenticator.properties access-control.properties /etc/trino/
COPY --chown=trino:trino silver.sql rules.json /etc/trino/bms/
COPY --chown=trino:trino --chmod=0755 start.sh /usr/lib/trino/bin/bamboo-start
CMD ["/usr/lib/trino/bin/bamboo-start"]
