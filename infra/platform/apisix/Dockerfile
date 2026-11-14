# Bamboo - DX-OS Open-Core
# @version 0.5.1
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

FROM alpine:3.22 AS coraza
ARG CORAZA_VERSION=0.6.0
ARG CORAZA_SHA256=cca4e3c75cf6b2e615907f936a1b6dcd0955250e0fb7d3b1c2ecef807d84603c
RUN url="https://github.com/corazawaf/coraza-proxy-wasm/releases/download/${CORAZA_VERSION}/coraza-proxy-wasm-${CORAZA_VERSION}.zip"; \
    n=0; until wget -q -T 60 -O /tmp/coraza.zip "$url"; do \
      n=$((n + 1)); [ "$n" -lt 5 ] || exit 1; sleep $((n * 5)); \
    done \
 && echo "${CORAZA_SHA256}  /tmp/coraza.zip" | sha256sum -c - \
 && unzip -q /tmp/coraza.zip -d /tmp/coraza \
 && test -f /tmp/coraza/coraza-proxy-wasm.wasm
COPY config.yaml apisix.yaml /tmp/conf/
RUN sed -i 's/\r$//' /tmp/conf/config.yaml /tmp/conf/apisix.yaml \
 && sed -i '/^#END[[:space:]]*$/d' /tmp/conf/apisix.yaml \
 && printf '\n#END\n' >> /tmp/conf/apisix.yaml \
 && grep -q '^routes:' /tmp/conf/apisix.yaml

FROM apache/apisix:3.19.0-debian
LABEL org.opencontainers.image.title="bamboo-gateway" \
      org.opencontainers.image.description="Bamboo: cổng API APISIX kèm WAF Coraza (OWASP CRS)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV APISIX_STAND_ALONE=true
COPY --from=coraza --chown=apisix:0 /tmp/coraza/coraza-proxy-wasm.wasm /usr/local/apisix/proxywasm/coraza-proxy-wasm.wasm
COPY --from=coraza --chown=apisix:0 /tmp/conf/config.yaml /usr/local/apisix/conf/config.yaml
COPY --from=coraza --chown=apisix:0 /tmp/conf/apisix.yaml /usr/local/apisix/conf/apisix.yaml
EXPOSE 9080
