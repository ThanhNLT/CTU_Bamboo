# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM quay.io/keycloak/keycloak:26.8.0
LABEL org.opencontainers.image.title="bamboo-keycloak" \
      org.opencontainers.image.description="Bamboo DX-OS: Keycloak kèm realm bms" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY realm/ /opt/keycloak/data/import/
COPY themes/ /opt/keycloak/themes/
