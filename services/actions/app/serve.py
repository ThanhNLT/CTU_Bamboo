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

"""Chạy dịch vụ actions khi bật mTLS nội bộ (infra/compose/mtls.yml, ADR #76).

Hai cổng trong một tiến trình, chung một ứng dụng: HTTPS `ACTIONS_TLS_PORT` (mặc định 8443) mở cho mạng Docker, bắt
buộc chứng chỉ máy khách do CA nội bộ cấp (cổng API, sidecar của Hasura, sleeper, Prometheus, Vector); HTTP 8000 chỉ
nghe 127.0.0.1 cho healthcheck trong container. Không bật mTLS thì vẫn chạy `uvicorn app.main:app` như cũ.
"""

import asyncio
import contextlib
import logging
import os
import pathlib
import signal
import ssl

import uvicorn

log = logging.getLogger("serve")


class _Server(uvicorn.Server):
    """Tín hiệu dừng do main() bắt chung cho cả hai cổng (uvicorn mặc định mỗi Server tự giành tín hiệu)."""

    @contextlib.contextmanager
    def capture_signals(self):
        yield


def configs(app="app.main:app") -> list[uvicorn.Config]:
    directory = pathlib.Path(os.environ["INTERNAL_TLS_DIR"])
    identity = os.environ["INTERNAL_TLS_IDENTITY"]
    common = {"access_log": False, "proxy_headers": False}
    plain = uvicorn.Config(app, host="127.0.0.1", port=int(os.environ.get("ACTIONS_HTTP_PORT", "8000")), **common)
    secure = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("ACTIONS_TLS_PORT", "8443")),
        lifespan="off",
        ssl_certfile=str(directory / f"{identity}.crt"),
        ssl_keyfile=str(directory / f"{identity}.key"),
        ssl_ca_certs=str(directory / "ca.crt"),
        ssl_cert_reqs=ssl.CERT_REQUIRED,
        **common,
    )
    return [plain, secure]


async def serve(servers: list[uvicorn.Server]) -> None:
    loop = asyncio.get_running_loop()

    def stop() -> None:
        for server in servers:
            server.should_exit = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop)
    # Cổng HTTP (có lifespan) khởi động trước để ứng dụng sẵn sàng trước khi nhận yêu cầu qua HTTPS.
    first = asyncio.create_task(servers[0].serve())
    while not servers[0].started and not first.done():
        await asyncio.sleep(0.05)
    tasks = [first, *(asyncio.create_task(s.serve()) for s in servers[1:])]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    stop()
    await asyncio.gather(*tasks, return_exceptions=True)


def main() -> None:
    servers = [_Server(c) for c in configs()]
    log.info("actions: HTTP 127.0.0.1:%s, HTTPS mTLS :%s", servers[0].config.port, servers[1].config.port)
    asyncio.run(serve(servers))


if __name__ == "__main__":
    main()
