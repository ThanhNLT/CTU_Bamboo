# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Action chậm không được chặn các request khác của cùng tiến trình: không cần CSDL."""

import asyncio
import time

import httpx

from app import auth, common, config, main
from conftest import SETTINGS


def test_slow_action_does_not_block_other_requests(monkeypatch):
    def slow(pool, name, payload, ctx):
        time.sleep(1.0)  # thư viện đồng bộ: CSDL, Flowable, Gotenberg
        return {"ok": True}

    monkeypatch.setattr(main, "run_action", slow)
    settings = config.Settings(**SETTINGS.__dict__)
    app = main.create_app(settings, pool=object(), ctx=common.Context(),
                          verifier=auth.KeycloakVerifier("", "", set(), jwks_client=object()))
    app.state.pool = object()

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://actions") as client:
            started = time.monotonic()
            action = asyncio.create_task(client.post(
                "/actions/get_purchase_request_pdf", json={}, headers={"x-actions-secret": settings.actions_secret}))
            await asyncio.sleep(0.1)
            health = await client.get("/healthz")
            waited = time.monotonic() - started
            assert (await action).json() == {"ok": True}
            return health.status_code, waited

    status, waited = asyncio.run(scenario())
    assert status == 200
    assert waited < 0.5
