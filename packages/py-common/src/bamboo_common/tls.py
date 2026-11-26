# Bamboo - DX-OS Open-Core
# @version 0.5.2
# @author CTUBamboo
# @copyright Copyright 2026 Bamboo
# @license Apache-2.0
# @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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

"""mTLS cho lời gọi HTTP giữa các dịch vụ (ADR #76, tệp infra/compose/mtls.yml).

`INTERNAL_TLS_DIR` là thư mục openbao-init ghi chứng chỉ dịch vụ: `<danh tính>.crt` (kèm CA trung gian),
`<danh tính>.key`, `ca.crt`; `INTERNAL_TLS_IDENTITY` là danh tính của dịch vụ (CN). Có đủ thì mọi lời gọi `https://`
tới dịch vụ nội bộ trình chứng chỉ máy khách và chỉ tin CA nội bộ; không có (máy dev chạy HTTP) thì giữ mặc định của
httpx. Chỉ dùng cho URL nội bộ: webhook, SMS, Ollama... ra ngoài không đi qua đây.
"""

import functools
import os
import pathlib
import ssl


@functools.cache
def context() -> ssl.SSLContext | None:
    """Ngữ cảnh TLS máy khách của dịch vụ; None khi chưa bật mTLS nội bộ."""
    directory = os.environ.get("INTERNAL_TLS_DIR", "")
    identity = os.environ.get("INTERNAL_TLS_IDENTITY", "")
    if not directory or not identity:
        return None
    base = pathlib.Path(directory)
    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH, cafile=str(base / "ca.crt"))
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(base / f"{identity}.crt", base / f"{identity}.key")
    return ctx


def verify(url: str) -> ssl.SSLContext | bool:
    """Giá trị `verify=` cho httpx khi gọi `url` nội bộ: ngữ cảnh mTLS với https, mặc định (True) với http."""
    ctx = context()
    return ctx if ctx is not None and url.lower().startswith("https://") else True
