# Bamboo - DX-OS Open-Core
# @version 0.5.1
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/CTUBamboo/Bamboo, Bamboo project
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Biên nhận giao tin và chứng cứ neo có chữ ký của hệ thống (chống chối bỏ).

Chữ ký chính là Ed25519 của khóa transit trong OpenBao (khóa riêng không rời két). Khi chưa có OpenBao (môi trường
thử) dùng HMAC-SHA256 với bí mật của dịch vụ và ghi rõ thuật toán để người xác minh biết mức đảm bảo.
"""

import hashlib
import hmac
import json
import logging
import os

from bamboo_common.openbao import Bao, BaoError

log = logging.getLogger("receipts")


class Signer:
    def __init__(self, bao: Bao | None, secret: str, key: str = "receipt"):
        self.bao, self.secret, self.key = bao, secret.encode(), key

    @classmethod
    def from_env(cls, secret: str, key: str = "receipt") -> "Signer":
        addr, approle = os.environ.get("BAO_ADDR"), os.environ.get("BAO_APPROLE_FILE")
        bao = None
        if addr and approle and os.path.exists(approle):
            try:
                bao = Bao.from_approle_file(addr, approle)
            except Exception as exc:  # noqa: BLE001
                log.warning("không đăng nhập được OpenBao để ký biên nhận: %s", exc)
        return cls(bao, secret, key)

    def sign(self, message: str) -> dict:
        data = message.encode()
        if self.bao is not None:
            try:
                return {"alg": "ed25519", "key": f"transit/{self.key}", "sig": self.bao.sign(data, self.key)}
            except BaoError as exc:
                log.warning("OpenBao không ký được, dùng HMAC: %s", exc)
        return {
            "alg": "hmac-sha256",
            "key": "actions-secret",
            "sig": hmac.new(self.secret, data, hashlib.sha256).hexdigest(),
        }

    def verify(self, message: str, proof: dict) -> bool:
        data = message.encode()
        if proof.get("alg") == "ed25519":
            return self.bao is not None and self.bao.verify(data, proof["sig"], self.key)
        if proof.get("alg") == "hmac-sha256":
            expected = hmac.new(self.secret, data, hashlib.sha256).hexdigest()
            return hmac.compare_digest(expected, str(proof.get("sig", "")))
        return False


def receipt_message(message_id: str, payload_sha256: str, channel: str, delivered_at: str, provider_id: str) -> str:
    """Chuỗi chuẩn được ký: gắn biên nhận với đúng nội dung (mã băm), kênh, thời điểm và mã của nhà cung cấp."""
    return json.dumps(
        [message_id, payload_sha256, channel, delivered_at, provider_id], ensure_ascii=False, separators=(",", ":")
    )


def make_receipt(
    signer: Signer, message_id: str, payload_sha256: str, channel: str, delivered_at: str, provider_id: str
) -> dict:
    proof = signer.sign(receipt_message(message_id, payload_sha256, channel, delivered_at, provider_id))
    return {"channel": channel, "provider_id": provider_id, "delivered_at": delivered_at, **proof}


def verify_receipt(signer: Signer, message_id: str, payload_sha256: str, receipt: dict) -> bool:
    message = receipt_message(
        message_id,
        payload_sha256,
        receipt.get("channel", ""),
        receipt.get("delivered_at", ""),
        receipt.get("provider_id", ""),
    )
    try:
        return signer.verify(message, receipt)
    except (BaoError, KeyError):
        return False
