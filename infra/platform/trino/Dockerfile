# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

FROM trinodb/trino:483
LABEL org.opencontainers.image.title="bamboo-trino" \
      org.opencontainers.image.description="Bamboo DX-OS: Trino truy vấn Lakehouse (Iceberg bronze/silver)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --chown=trino:trino config.properties jvm.config password-authenticator.properties access-control.properties /etc/trino/
COPY --chown=trino:trino silver.sql rules.json /etc/trino/bms/
COPY --chown=trino:trino --chmod=0755 start.sh /usr/lib/trino/bin/bamboo-start
USER root
RUN sed -i 's/\r$//' /usr/lib/trino/bin/bamboo-start /etc/trino/*.properties /etc/trino/jvm.config /etc/trino/bms/silver.sql \
 && chown trino:trino /usr/lib/trino/bin/bamboo-start /etc/trino/*.properties /etc/trino/jvm.config /etc/trino/bms/silver.sql \
 && chmod 0755 /usr/lib/trino/bin/bamboo-start
USER trino
CMD ["/usr/lib/trino/bin/bamboo-start"]
