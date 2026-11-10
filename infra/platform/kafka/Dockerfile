# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

FROM apache/kafka:4.3.1
LABEL org.opencontainers.image.title="bamboo-kafka" \
      org.opencontainers.image.description="Bamboo DX-OS: Kafka KRaft kèm SCRAM và ACL cho CDC" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=appuser:appuser kafka_server_jaas.conf /etc/kafka/bamboo/kafka_server_jaas.conf
COPY --chown=appuser:appuser --chmod=0755 start.sh /etc/kafka/bamboo/start.sh
# bỏ CRLF của bản clone Windows (core.autocrlf=true)
USER root
RUN sed -i 's/\r$//' /etc/kafka/bamboo/start.sh /etc/kafka/bamboo/kafka_server_jaas.conf \
 && chown appuser:appuser /etc/kafka/bamboo/start.sh /etc/kafka/bamboo/kafka_server_jaas.conf \
 && chmod 0755 /etc/kafka/bamboo/start.sh
USER appuser
ENV KAFKA_OPTS=-Djava.security.auth.login.config=/etc/kafka/bamboo/kafka_server_jaas.conf
CMD ["/etc/kafka/bamboo/start.sh"]
