# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ ngủ (ADR #53): chỉ dùng thư viện chuẩn của Python.
FROM python:3.13-slim
LABEL org.opencontainers.image.title="bamboo-sleeper" \
      org.opencontainers.image.description="Bamboo DX-OS: đánh thức dịch vụ Tầng 1 khi có yêu cầu, cho ngủ khi nhàn rỗi" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv/sleeper
COPY services/sleeper/app ./app
RUN python -m compileall -q app
CMD ["python", "-m", "app.sleeper"]
