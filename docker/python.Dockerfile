# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Image Python dùng chung cho mọi dịch vụ (ADR #10): build arg APP_DIR là thư mục dịch vụ.
FROM python:3.13-slim
ARG APP_DIR
LABEL org.opencontainers.image.title="bamboo-python" \
      org.opencontainers.image.description="Bamboo DX-OS: dịch vụ Python (actions, flow-sync, bootstrap, openbao-init, seed)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
# Log ra ngay (docker logs), không ghi .pyc vào image.
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /repo/${APP_DIR}
COPY constraints.txt /repo/constraints.txt
# REQUIREMENTS: tệp gói cần cài (image bamboo-lakehouse dùng requirements-lakehouse.txt, ADR #39).
ARG REQUIREMENTS=requirements.txt
COPY ${APP_DIR}/requirements*.txt ./
RUN pip install --no-cache-dir -r ${REQUIREMENTS} -c /repo/constraints.txt
COPY ${APP_DIR}/app ./app
# Biên dịch sẵn bytecode (PYTHONDONTWRITEBYTECODE chặn ghi lúc chạy): container khởi động không phải dịch lại.
RUN python -m compileall -q app
COPY platform /repo/platform
# Tệp dữ liệu demo nhóm 5 (ADR #50) cho job seed; nhỏ (~2,5 MB) nên chép chung, giữ một Dockerfile.
COPY services/seed/data /repo/services/seed/data
# Chạy bằng người dùng không đặc quyền. Job openbao-init (ghi volume secret) và kiểm thử
# (cài gói) chạy bằng root, khai báo trong docker-compose.yml.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER 10001
