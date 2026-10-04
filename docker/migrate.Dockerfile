# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Job migrate: PostgreSQL client + migration và kiểm thử CSDL đóng gói sẵn (không cần mã nguồn khi chạy).
# Chỉ cần client psql + bash (PostGIS nằm ở server db); image postgres chính thức có cả amd64 lẫn arm64.
FROM postgres:17
COPY db /repo/db
COPY scripts/db /repo/scripts/db
ENTRYPOINT ["/repo/scripts/db/up.sh"]
