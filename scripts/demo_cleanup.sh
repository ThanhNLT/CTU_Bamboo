#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0
#
# Xóa các đề nghị mua sắm do người dùng lập qua ứng dụng khi thử chức năng duyệt, đưa dữ liệu về như tài liệu demo.
# Mặc định chỉ xem trước (không ghi gì). Thêm --apply để xóa thật.
#   scripts/demo_cleanup.sh            # xem trước
#   scripts/demo_cleanup.sh --apply    # xóa thật
# Giữ nguyên dữ liệu seed, nhật ký kiểm toán (chỉ ghi thêm), người dùng và tệp khác. Xóa cả quy trình Flowable
# tương ứng; chỉ mục tìm kiếm tự dọn bởi search-sync. Đề nghị seed mà bạn đã duyệt thử vẫn giữ trạng thái đã đổi:
# muốn khôi phục cả phần đó thì phải nạp lại CSDL (docker compose down -v).
set -euo pipefail
cd "$(dirname "$0")/.."

mode=ROLLBACK
case "${1:-}" in
    --apply) mode=COMMIT ;;
    "") ;;
    *) echo "Cách dùng: $0 [--apply]" >&2; exit 2 ;;
esac

out=$(docker compose exec -T db psql -X -q -U bms -d bms -v finish=$mode -f - < scripts/demo_cleanup.sql 2>&1) || {
    echo "$out" >&2
    echo "Không xóa gì (giao dịch đã hủy)." >&2
    exit 1
}
echo "$out" | grep -v 'NOTICE:  FLOWABLE '

if [ "$mode" = ROLLBACK ]; then
    echo
    echo "Đây là bản xem trước, chưa xóa gì. Chạy lại với --apply để xóa thật."
    exit 0
fi

ids=$(echo "$out" | sed -n 's/.*NOTICE:  FLOWABLE //p' | tr '\n' ' ')
if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker compose exec -T actions python - $ids << 'PY'
import sys

import httpx

from app import config

s = config.load()
with httpx.Client(base_url=s.flowable_url, auth=(s.flowable_user, s.flowable_password), timeout=15) as http:
    for pid in sys.argv[1:]:
        for path in (f"/runtime/process-instances/{pid}", f"/history/historic-process-instances/{pid}"):
            r = http.delete(path)
            if r.status_code not in (204, 404):
                print(f"Flowable {path}: HTTP {r.status_code}", file=sys.stderr)
print(f"đã dọn {len(sys.argv) - 1} quy trình Flowable")
PY
fi
echo "Xong. Chỉ mục tìm kiếm sẽ được search-sync dọn trong ít giây."
