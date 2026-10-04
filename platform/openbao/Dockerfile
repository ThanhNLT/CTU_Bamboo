# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# OpenBao kèm cấu hình lưu bền raft một node (ADR #25).
FROM openbao/openbao:2.7.1
LABEL org.opencontainers.image.title="bamboo-openbao" \
      org.opencontainers.image.description="Bamboo DX-OS: OpenBao kèm cấu hình raft một node" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY config.hcl /openbao/config/config.hcl
