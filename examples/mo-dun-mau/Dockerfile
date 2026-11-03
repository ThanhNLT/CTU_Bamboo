# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM python:3.13-slim
WORKDIR /app
COPY app.py .
USER 65534
EXPOSE 8080
CMD ["python", "app.py"]
