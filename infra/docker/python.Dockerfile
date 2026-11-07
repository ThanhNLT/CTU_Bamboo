# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Image Python dùng chung (actions, flow-sync, bootstrap, openbao-init, seed, lakehouse-sink).
# Phiên bản lấy từ uv.lock ở gốc (uv workspace); image chỉ cài phụ thuộc của package nó chạy:
#   APP_DIR     thư mục service (services/actions, services/seed)
#   PACKAGE     tên package trong workspace (mặc định bamboo-<tên thư mục APP_DIR>)
#   DEP_GROUPS  nhóm phụ thuộc thêm, cách nhau dấu cách (vd. lakehouse cho image bamboo-lakehouse)
FROM ghcr.io/astral-sh/uv:0.13.6 AS uv

# Chỉ manifest + lock: đổi mã nguồn không làm mất cache lớp cài phụ thuộc.
FROM scratch AS manifests
ARG APP_DIR
COPY pyproject.toml uv.lock /ws/
COPY ${APP_DIR}/pyproject.toml /ws/${APP_DIR}/

FROM python:3.13-slim
ARG APP_DIR
ARG PACKAGE=
ARG DEP_GROUPS=
LABEL org.opencontainers.image.title="bamboo-python" \
      org.opencontainers.image.description="Bamboo DX-OS: dịch vụ Python (actions, flow-sync, bootstrap, openbao-init, seed)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2
WORKDIR /repo/${APP_DIR}
# uv chỉ giải lock (không nằm lại trong image); pip cài vào Python hệ thống như trước, kiểm hash từ lock.
# /opt/bamboo/dev-pins.txt: phiên bản nhóm dev (pytest…) cho các lệnh test cài lúc chạy (`make test-*`);
# đặt ngoài /repo vì các lệnh test mount mã nguồn đè lên /repo.
RUN --mount=from=uv,source=/uv,target=/usr/local/bin/uv \
    --mount=from=manifests,source=/ws,target=/ws \
    set -eu; export UV_NO_CACHE=1; pkg="${PACKAGE:-bamboo-${APP_DIR##*/}}"; set --; \
    for g in ${DEP_GROUPS}; do set -- "$@" --group "$g"; done; \
    cd /ws; \
    uv export --frozen --package "$pkg" --no-dev "$@" --no-emit-workspace --no-header -o /tmp/req.txt; \
    mkdir -p /opt/bamboo; \
    uv export --frozen --package "$pkg" --no-dev "$@" --no-editable --no-hashes --no-header --no-annotate \
      | { grep '^\./' || true; } > /opt/bamboo/workspace-deps.txt; \
    uv export --frozen --package "$pkg" --only-group dev --no-emit-workspace --no-hashes --no-header \
      -o /opt/bamboo/dev-pins.txt; \
    pip install --no-cache-dir -r /tmp/req.txt; \
    rm /tmp/req.txt
# Gói dùng chung trong workspace (packages/*, vd. bamboo-common cho actions) mà package này phụ thuộc:
# cài thường (không editable) vào site-packages nên các lệnh mount mã nguồn đè /repo không ảnh hưởng.
# uv dựng trực tiếp backend uv_build, không tải gì từ mạng; phụ thuộc ngoài đã có ở lớp trên.
RUN --mount=from=uv,source=/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=packages,target=/ws/packages \
    set -eu; cd /ws; \
    if [ -s /opt/bamboo/workspace-deps.txt ]; then \
      UV_NO_CACHE=1 uv pip install --system --offline --no-deps $(cat /opt/bamboo/workspace-deps.txt); \
    fi
COPY ${APP_DIR}/app ./app
RUN python -m compileall -q app
COPY infra/platform /repo/infra/platform
COPY services/seed/data /repo/services/seed/data
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER 10001
