# Image Python dùng chung cho mọi dịch vụ (ADR #10): build arg APP_DIR là thư mục dịch vụ.
FROM python:3.13-slim
ARG APP_DIR
WORKDIR /repo/${APP_DIR}
COPY constraints.txt /repo/constraints.txt
COPY ${APP_DIR}/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -c /repo/constraints.txt
COPY ${APP_DIR}/app ./app
COPY platform /repo/platform
