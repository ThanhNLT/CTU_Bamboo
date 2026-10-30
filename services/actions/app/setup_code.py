# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
"""Mã thiết lập một lần cho trang khởi tạo công ty (ADR #57): `python -m app.setup_code`.

`bootstrap` tự gọi mỗi lần khởi động khi hệ thống chưa có công ty; mã cũ chưa dùng bị hủy. Chỉ người đọc được log hoặc chạy
được lệnh trên máy chủ mới có mã, nên người lạ mở trang trước không chiếm được hệ thống.
"""

import logging
import sys

import psycopg

from . import config, setup

log = logging.getLogger("setup_code")


def announce(database_url: str) -> str | None:
    with psycopg.connect(database_url) as conn, conn.transaction():
        if not setup.is_open(conn):
            return None
        code = setup.new_code(conn)
    hours = int(setup.CODE_TTL.total_seconds() // 3600)
    banner = "=" * 64
    log.warning(
        '\n%s\nHệ thống chưa có công ty. Mở trang đăng nhập, chọn "Tạo công ty mới" và nhập\nMÃ THIẾT LẬP: %s'
        "\n(dùng một lần, hết hạn sau %d giờ; lấy mã mới: python -m app.setup_code)\n%s",
        banner,
        code,
        hours,
        banner,
    )
    return code


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if announce(config.load().database_url) is None:
        print("Hệ thống đã có công ty: không cần mã thiết lập")
    return 0


if __name__ == "__main__":
    sys.exit(main())
