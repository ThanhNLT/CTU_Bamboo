# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

FROM python:3.11-slim-bookworm
ARG TORCH_VERSION=2.9.1 TORCHVISION_VERSION=0.24.1
LABEL org.opencontainers.image.title="bamboo-ocr" \
      org.opencontainers.image.description="Bamboo: OCR tiếng Việt (PaddleOCR + VietOCR trên PyTorch)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/CTU_Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/CTU_Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0" \
      bamboo.gpu.prepare="python -m app.accel"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2 \
    OCR_MODELS_DIR=/models PADDLE_PDX_CACHE_HOME=/models/paddlex HF_HOME=/models/huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True OCR_ACCEL_DIR=/opt/accel
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /models /opt/accel && chown 10001 /models /opt/accel
# Cài bằng uv, bộ đệm tải về ở cache mount của BuildKit (không nằm trong image). PyTorch bản CPU từ kho của PyTorch;
# gói còn lại theo services/ocr/uv.lock (trên Linux lockfile không kèm torch), vietocr cài không kèm phụ thuộc.
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.6,source=/uv,target=/usr/local/bin/uv \
    --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    UV_LINK_MODE=copy uv pip install --system --index-url https://download.pytorch.org/whl/cpu \
      torch==${TORCH_VERSION} torchvision==${TORCHVISION_VERSION}
WORKDIR /srv/ocr
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.6,source=/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=services/ocr/pyproject.toml,target=/tmp/ocr/pyproject.toml \
    --mount=type=bind,source=services/ocr/uv.lock,target=/tmp/ocr/uv.lock \
    --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    set -eu; cd /tmp/ocr; export UV_LINK_MODE=copy; \
    uv export --frozen --no-dev --no-emit-project --no-hashes --no-header -o /tmp/req.txt; \
    grep -v '^vietocr==' /tmp/req.txt > /tmp/req-main.txt; grep '^vietocr==' /tmp/req.txt > /tmp/req-vietocr.txt; \
    uv pip install --system -r /tmp/req-main.txt; \
    uv pip install --system --no-deps -r /tmp/req-vietocr.txt; \
    rm /tmp/req.txt /tmp/req-main.txt /tmp/req-vietocr.txt
COPY services/ocr/app ./app
RUN python -m compileall -q app
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
