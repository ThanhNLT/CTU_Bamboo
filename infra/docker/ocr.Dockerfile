# OCR_VARIANT=cpu (mặc định): PyTorch bản CPU trên python:3.11-slim, mọi thành phần đều giấy phép nguồn mở được OSI phê
# duyệt, không có CUDA/cuDNN. OCR_VARIANT=cuda: nền pytorch/pytorch có CUDA/cuDNN (giấy phép NVIDIA, không phải nguồn
# mở) để OCR chạy trên GPU NVIDIA; chỉ dựng tại máy (BAMBOO_OCR_VARIANT=cuda), không phát hành lên GHCR (ADR #80).
ARG OCR_VARIANT=cpu

FROM python:3.11-slim-bookworm AS base-cpu
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.9.1 torchvision==0.24.1
LABEL org.opencontainers.image.licenses="Apache-2.0" \
      bamboo.gpu="false"

FROM pytorch/pytorch:2.9.1-cuda12.8-cudnn9-runtime AS base-cuda
LABEL org.opencontainers.image.licenses="Apache-2.0 AND LicenseRef-NVIDIA-CUDA-EULA AND LicenseRef-NVIDIA-cuDNN-SLA" \
      bamboo.gpu="true"

FROM base-${OCR_VARIANT}
ARG OCR_VARIANT
LABEL org.opencontainers.image.title="bamboo-ocr" \
      org.opencontainers.image.description="Bamboo DX-OS: OCR tiếng Việt (PaddleOCR + VietOCR), bản ${OCR_VARIANT}" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2 \
    OCR_MODELS_DIR=/models PADDLE_PDX_CACHE_HOME=/models/paddlex HF_HOME=/models/huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/ocr
# Bản cuda: các gói --no-emit-package đã có sẵn trong môi trường conda của image nền, cài lại sẽ xung đột.
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.6,source=/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=services/ocr/pyproject.toml,target=/tmp/ocr/pyproject.toml \
    --mount=type=bind,source=services/ocr/uv.lock,target=/tmp/ocr/uv.lock \
    set -eu; cd /tmp/ocr; \
    skip=""; \
    if [ "$OCR_VARIANT" = cuda ]; then \
      for p in attrs beautifulsoup4 certifi cffi chardet charset-normalizer filelock numpy packaging psutil pycparser \
               pygments pysocks requests ruamel-yaml setuptools soupsieve tqdm truststore urllib3; do \
        skip="$skip --no-emit-package $p"; \
      done; \
    fi; \
    UV_NO_CACHE=1 uv export --frozen --no-dev --no-emit-project --no-hashes --no-header -o /tmp/req.txt $skip; \
    grep -v '^vietocr==' /tmp/req.txt > /tmp/req-main.txt; grep '^vietocr==' /tmp/req.txt > /tmp/req-vietocr.txt; \
    pip install --no-cache-dir -r /tmp/req-main.txt; \
    pip install --no-cache-dir --no-deps -r /tmp/req-vietocr.txt; \
    rm /tmp/req.txt /tmp/req-main.txt /tmp/req-vietocr.txt
COPY services/ocr/app ./app
RUN python -m compileall -q app && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /models && chown 10001 /models
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
