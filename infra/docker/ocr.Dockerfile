FROM pytorch/pytorch:2.9.1-cuda12.8-cudnn9-runtime
LABEL org.opencontainers.image.title="bamboo-ocr" \
      org.opencontainers.image.description="Bamboo DX-OS: OCR tiếng Việt, GPU hoặc CPU (PaddleOCR + VietOCR)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2 \
    OCR_MODELS_DIR=/models PADDLE_PDX_CACHE_HOME=/models/paddlex HF_HOME=/models/huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/ocr
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.6,source=/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=services/ocr/pyproject.toml,target=/tmp/ocr/pyproject.toml \
    --mount=type=bind,source=services/ocr/uv.lock,target=/tmp/ocr/uv.lock \
    set -eu; cd /tmp/ocr; \
    UV_NO_CACHE=1 uv export --frozen --no-dev --no-emit-project --no-hashes --no-header -o /tmp/req.txt \
      --no-emit-package attrs --no-emit-package beautifulsoup4 --no-emit-package certifi --no-emit-package cffi \
      --no-emit-package chardet --no-emit-package charset-normalizer --no-emit-package filelock \
      --no-emit-package numpy --no-emit-package packaging --no-emit-package psutil --no-emit-package pycparser \
      --no-emit-package pygments --no-emit-package pysocks --no-emit-package requests \
      --no-emit-package ruamel-yaml --no-emit-package setuptools --no-emit-package soupsieve \
      --no-emit-package tqdm --no-emit-package truststore --no-emit-package urllib3; \
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
