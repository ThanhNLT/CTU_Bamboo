# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

FROM python:3.13-slim
WORKDIR /app
COPY app.py .
USER 65534
EXPOSE 8080
CMD ["python", "app.py"]
