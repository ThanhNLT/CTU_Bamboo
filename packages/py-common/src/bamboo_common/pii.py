# Bamboo - DX-OS Open-Core
# @version 0.5.0
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

import threading

from bamboo_common.openbao import Bao, BaoError


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


def mask_tail(value: str, keep: int) -> str:
    compact = "".join(value.split())
    if len(compact) <= keep:
        return "•" * len(compact)
    return "•" * (len(compact) - keep) + compact[-keep:]


def mask_address(value: str) -> str:
    parts = [p.strip() for p in value.split(",") if p.strip()]
    return f"•••, {parts[-1]}" if len(parts) > 1 else "•••"
