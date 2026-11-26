# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

FROM apache/kafka:4.3.1
LABEL org.opencontainers.image.title="bamboo-kafka" \
      org.opencontainers.image.description="Bamboo: Kafka KRaft kèm SCRAM và ACL cho CDC" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/CTU_Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/CTU_Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=appuser:appuser kafka_server_jaas.conf /etc/kafka/bamboo/kafka_server_jaas.conf
COPY --chown=appuser:appuser --chmod=0755 start.sh /etc/kafka/bamboo/start.sh
USER root
RUN sed -i 's/\r$//' /etc/kafka/bamboo/start.sh /etc/kafka/bamboo/kafka_server_jaas.conf \
 && chown appuser:appuser /etc/kafka/bamboo/start.sh /etc/kafka/bamboo/kafka_server_jaas.conf \
 && chmod 0755 /etc/kafka/bamboo/start.sh
USER appuser
ENV KAFKA_OPTS=-Djava.security.auth.login.config=/etc/kafka/bamboo/kafka_server_jaas.conf
CMD ["/etc/kafka/bamboo/start.sh"]
