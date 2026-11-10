FROM python:3.13-slim
LABEL org.opencontainers.image.title="bamboo-sleeper" \
      org.opencontainers.image.description="Bamboo DX-OS: đánh thức dịch vụ dùng thưa (Tầng 1, AI) khi có yêu cầu, cho ngủ khi nhàn rỗi" \
      org.opencontainers.image.source="https://github.com/CTUBamboo/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/CTUBamboo/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv/sleeper
COPY services/sleeper/app ./app
RUN python -m compileall -q app
CMD ["python", "-m", "app.sleeper"]
