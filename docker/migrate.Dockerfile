# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
# SPDX-License-Identifier: Apache-2.0
# Job migrate: PostgreSQL client + migration và kiểm thử CSDL đóng gói sẵn (không cần mã nguồn khi chạy).
FROM postgis/postgis:17-3.5
COPY db /repo/db
COPY scripts/db /repo/scripts/db
ENTRYPOINT ["/repo/scripts/db/up.sh"]
