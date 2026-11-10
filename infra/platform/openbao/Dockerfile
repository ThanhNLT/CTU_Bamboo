# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

FROM openbao/openbao:2.7.1
LABEL org.opencontainers.image.title="bamboo-openbao" \
      org.opencontainers.image.description="Bamboo DX-OS: OpenBao kèm cấu hình raft một node" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY config.hcl /openbao/config/config.hcl
