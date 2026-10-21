# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Dịch vụ OCR (ADR #52): PaddleOCR (engine transformers) + VietOCR trên PyTorch; dùng CUDA nếu có GPU, không thì CPU.
FROM pytorch/pytorch:2.9.1-cuda12.8-cudnn9-runtime
LABEL org.opencontainers.image.title="bamboo-ocr" \
      org.opencontainers.image.description="Bamboo DX-OS: OCR tiếng Việt, GPU hoặc CPU (PaddleOCR + VietOCR)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MALLOC_ARENA_MAX=2 \
    OCR_MODELS_DIR=/models PADDLE_PDX_CACHE_HOME=/models/paddlex HF_HOME=/models/huggingface \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/ocr
COPY services/ocr/requirements.txt services/ocr/constraints.txt ./
RUN pip install --no-cache-dir -r requirements.txt -c constraints.txt \
    && pip install --no-cache-dir --no-deps -c constraints.txt vietocr
COPY services/ocr/app ./app
RUN python -m compileall -q app && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /models && chown 10001 /models
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
