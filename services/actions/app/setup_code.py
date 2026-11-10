# Bamboo - DX-OS Open-Core
# @version 0.4.0
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project

"""Mở cửa sổ đăng ký 24 giờ trên hệ thống trống (ADR #57, #62): `python -m app.setup_code` (`make setup-code`).

`bootstrap` tự gọi mỗi lần khởi động khi hệ thống chưa có công ty; mã cũ chưa dùng bị hủy. Trong khi còn mã hiệu lực, trang
đăng ký mở mà không phải nhập mã (ADR #62); mã vẫn in ra log cho lệnh cũ gửi kèm `setup_code`.
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
        '\n%s\nHệ thống chưa có công ty. Mở trang đăng nhập, chọn "Tạo tài khoản" để đăng ký doanh nghiệp.'
        "\nTrang đăng ký mở trong %d giờ; hết hạn thì chạy make setup-code (python -m app.setup_code)."
        "\nMÃ THIẾT LẬP (chỉ cần cho lệnh cũ): %s\n%s",
        banner,
        hours,
        code,
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
