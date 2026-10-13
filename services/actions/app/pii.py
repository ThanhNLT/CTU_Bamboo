# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Mã hóa dữ liệu cá nhân nhạy cảm bằng khóa transit `pii` của OpenBao (ADR #25, #41).

CSDL chỉ giữ bản mã `vault:v1:...` và bản che để hiển thị; khóa không rời OpenBao. Token AppRole hết hạn
sau 1 giờ nên lỗi 403 thì đăng nhập lại một lần rồi thử lại.
"""

# ===== Thư viện chuẩn =====
import threading

# ===== Module nội bộ =====
from .openbao import Bao, BaoError


# ===== Lớp =====
class PiiCipher:
    def __init__(self, addr: str, approle_file: str):
        self.addr = addr
        self.approle_file = approle_file
        self._bao: Bao | None = None
        self._lock = threading.Lock()

    def _client(self, fresh: bool = False) -> Bao:
        with self._lock:
            if self._bao is None or fresh:
                self._bao = Bao.from_approle_file(self.addr, self.approle_file)
            return self._bao

    def _call(self, method: str, value: str) -> str:
        try:
            return getattr(self._client(), method)(value)
        except BaoError as exc:
            if exc.status != 403:
                raise
            return getattr(self._client(fresh=True), method)(value)

    def encrypt(self, plaintext: str) -> str:
        return self._call("encrypt", plaintext)

    def decrypt(self, ciphertext: str) -> str:
        return self._call("decrypt", ciphertext)


# ===== Hàm =====
def mask_tail(value: str, keep: int) -> str:
    """Giữ `keep` ký tự cuối (bỏ khoảng trắng), còn lại thay bằng chấm tròn: 079123456789 → •••••••••789."""
    compact = "".join(value.split())
    if len(compact) <= keep:
        return "•" * len(compact)
    return "•" * (len(compact) - keep) + compact[-keep:]


def mask_address(value: str) -> str:
    """Chỉ giữ phần cuối (tỉnh/thành): "12 Lý Thái Tổ, Hoàn Kiếm, Hà Nội" → "•••, Hà Nội"."""
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return f"•••, {parts[-1]}" if len(parts) > 1 else "•••"
