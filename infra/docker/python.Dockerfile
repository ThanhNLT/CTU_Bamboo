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

FROM ghcr.io/astral-sh/uv:0.13.6 AS uv

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
