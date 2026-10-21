# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM python:3.13-slim
ARG APP_DIR
LABEL org.opencontainers.image.title="bamboo-python" \
      org.opencontainers.image.description="Bamboo DX-OS: dịch vụ Python (actions, flow-sync, bootstrap, openbao-init, seed)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2
WORKDIR /repo/${APP_DIR}
COPY constraints.txt /repo/constraints.txt
ARG REQUIREMENTS=requirements.txt
COPY ${APP_DIR}/requirements*.txt ./
RUN pip install --no-cache-dir -r ${REQUIREMENTS} -c /repo/constraints.txt
COPY ${APP_DIR}/app ./app
RUN python -m compileall -q app
COPY platform /repo/platform
COPY services/seed/data /repo/services/seed/data
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER 10001
