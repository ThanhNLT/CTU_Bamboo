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

import asyncio
import time

import httpx

from app import auth, common, config, main
from conftest import SETTINGS


def test_slow_action_does_not_block_other_requests(monkeypatch):
    def slow(pool, name, payload, ctx):
        time.sleep(1.0)
        return {"ok": True}

    monkeypatch.setattr(main, "run_action", slow)
    settings = config.Settings(**SETTINGS.__dict__)
    app = main.create_app(
        settings,
        pool=object(),
        ctx=common.Context(),
        verifier=auth.KeycloakVerifier("", "", set(), jwks_client=object()),
    )
    app.state.pool = object()

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://actions") as client:
            started = time.monotonic()
            action = asyncio.create_task(
                client.post(
                    "/actions/get_purchase_request_pdf", json={}, headers={"x-actions-secret": settings.actions_secret}
                )
            )
            await asyncio.sleep(0.1)
            health = await client.get("/healthz")
            waited = time.monotonic() - started
            assert (await action).json() == {"ok": True}
            return health.status_code, waited

    status, waited = asyncio.run(scenario())
    assert status == 200
    assert waited < 0.5
