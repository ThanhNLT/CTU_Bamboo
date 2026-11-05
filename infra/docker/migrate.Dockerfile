# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
FROM postgres:17
LABEL org.opencontainers.image.title="bamboo-migrate" \
      org.opencontainers.image.description="Bamboo DX-OS: migration và kiểm thử CSDL (chạy một lần rồi thoát)" \
      org.opencontainers.image.source="https://github.com/ThanhNLT/Bamboo" \
      org.opencontainers.image.documentation="https://github.com/ThanhNLT/Bamboo#readme" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY db /repo/db
COPY tools/db /repo/tools/db
# Bản clone Windows (core.autocrlf=true) mang CRLF: `bash\r` làm migrate thoát ngay, cả hệ thống không lên
RUN find /repo -type f \( -name '*.sh' -o -name '*.sql' \) -exec sed -i 's/\r$//' {} + && chmod 0755 /repo/tools/db/*.sh
ENTRYPOINT ["/repo/tools/db/up.sh"]
