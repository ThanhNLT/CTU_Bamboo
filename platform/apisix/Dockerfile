# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Cổng API (ADR #34): APISIX standalone + WAF Coraza (OWASP CRS) dạng Proxy-Wasm.
FROM alpine:3.22 AS coraza
ARG CORAZA_VERSION=0.6.0
ARG CORAZA_SHA256=cca4e3c75cf6b2e615907f936a1b6dcd0955250e0fb7d3b1c2ecef807d84603c
RUN wget -q -O /tmp/coraza.zip \
      "https://github.com/corazawaf/coraza-proxy-wasm/releases/download/${CORAZA_VERSION}/coraza-proxy-wasm-${CORAZA_VERSION}.zip" \
 && echo "${CORAZA_SHA256}  /tmp/coraza.zip" | sha256sum -c - \
 && unzip -q /tmp/coraza.zip -d /tmp/coraza \
 && test -f /tmp/coraza/coraza-proxy-wasm.wasm

FROM apache/apisix:3.19.0-debian
LABEL org.opencontainers.image.title="bamboo-gateway" \
      org.opencontainers.image.description="Bamboo DX-OS: cổng API APISIX kèm WAF Coraza (OWASP CRS)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV APISIX_STAND_ALONE=true
COPY --from=coraza --chown=apisix:0 /tmp/coraza/coraza-proxy-wasm.wasm /usr/local/apisix/proxywasm/coraza-proxy-wasm.wasm
COPY --chown=apisix:0 config.yaml /usr/local/apisix/conf/config.yaml
COPY --chown=apisix:0 apisix.yaml /usr/local/apisix/conf/apisix.yaml
EXPOSE 9080
