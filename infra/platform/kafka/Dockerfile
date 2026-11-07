# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM apache/kafka:4.3.1
LABEL org.opencontainers.image.title="bamboo-kafka" \
      org.opencontainers.image.description="Bamboo DX-OS: Kafka KRaft kèm SCRAM và ACL cho CDC" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=appuser:appuser kafka_server_jaas.conf /etc/kafka/bamboo/kafka_server_jaas.conf
COPY --chown=appuser:appuser --chmod=0755 start.sh /etc/kafka/bamboo/start.sh
ENV KAFKA_OPTS=-Djava.security.auth.login.config=/etc/kafka/bamboo/kafka_server_jaas.conf
CMD ["/etc/kafka/bamboo/start.sh"]
