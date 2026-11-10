# OCR tiếng Việt (ADR #52, #80): PyTorch bản CPU trên python:3.11-slim, mọi thành phần đều giấy phép nguồn mở được OSI
# phê duyệt, không có CUDA/cuDNN. Máy có GPU NVIDIA: sleeper chạy `python -m app.accel` (nhãn bamboo.gpu.prepare) một lần
# để tải PyTorch bản CUDA từ kho của PyTorch vào volume /opt/accel (app.accelpath đưa lên đầu sys.path) rồi chuyển OCR sang GPU.
FROM python:3.11-slim-bookworm
ARG TORCH_VERSION=2.9.1 TORCHVISION_VERSION=0.24.1
LABEL org.opencontainers.image.title="bamboo-ocr" \
      org.opencontainers.image.description="Bamboo DX-OS: OCR tiếng Việt (PaddleOCR + VietOCR trên PyTorch)" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0" \
      bamboo.gpu.prepare="python -m app.accel"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2 \
    OCR_MODELS_DIR=/models PADDLE_PDX_CACHE_HOME=/models/paddlex HF_HOME=/models/huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True OCR_ACCEL_DIR=/opt/accel
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
      torch==${TORCH_VERSION} torchvision==${TORCHVISION_VERSION}
WORKDIR /srv/ocr
RUN --mount=from=ghcr.io/astral-sh/uv:0.13.6,source=/uv,target=/usr/local/bin/uv \
    --mount=type=bind,source=services/ocr/pyproject.toml,target=/tmp/ocr/pyproject.toml \
    --mount=type=bind,source=services/ocr/uv.lock,target=/tmp/ocr/uv.lock \
    set -eu; cd /tmp/ocr; \
    UV_NO_CACHE=1 uv export --frozen --no-dev --no-emit-project --no-hashes --no-header -o /tmp/req.txt; \
    grep -v '^vietocr==' /tmp/req.txt > /tmp/req-main.txt; grep '^vietocr==' /tmp/req.txt > /tmp/req-vietocr.txt; \
    pip install --no-cache-dir -r /tmp/req-main.txt; \
    pip install --no-cache-dir --no-deps -r /tmp/req-vietocr.txt; \
    rm /tmp/req.txt /tmp/req-main.txt /tmp/req-vietocr.txt
COPY services/ocr/app ./app
RUN python -m compileall -q app && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /models /opt/accel && chown 10001 /models /opt/accel
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
