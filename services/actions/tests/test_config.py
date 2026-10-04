# SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
#
# SPDX-License-Identifier: Apache-2.0

"""Chặn chạy production với mật khẩu/secret mặc định của môi trường dev."""

import pytest

from app import config

STRONG = {name: f"bi-mat-rieng-{i}" for i, name in enumerate(config.DEV_DEFAULTS)}


def test_moi_truong_dev_khong_chan():
    config.assert_production_ready({"BAMBOO_ENV": "development"})
    config.assert_production_ready({})


def test_production_du_secret_rieng():
    config.assert_production_ready({"BAMBOO_ENV": "production", **STRONG})


@pytest.mark.parametrize("name", list(config.DEV_DEFAULTS))
def test_production_con_gia_tri_mac_dinh(name):
    env = {"BAMBOO_ENV": "production", **STRONG, name: config.DEV_DEFAULTS[name]}
    with pytest.raises(SystemExit, match=name):
        config.assert_production_ready(env)


def test_production_thieu_bien_coi_nhu_mac_dinh():
    env = {"BAMBOO_ENV": "PRODUCTION", **STRONG}
    del env["ACTIONS_SECRET"]
    env["DEMO_PASSWORD"] = ""
    assert config.production_problems(env) == ["ACTIONS_SECRET", "DEMO_PASSWORD"]
    with pytest.raises(SystemExit):
        config.assert_production_ready(env)
