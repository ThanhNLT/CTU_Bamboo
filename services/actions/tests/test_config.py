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

import pytest

from app import config

STRONG = {name: f"bi-mat-rieng-{i}" for i, name in enumerate(config.DEV_DEFAULTS)} | {"HASURA_ENABLE_CONSOLE": "false"}


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


@pytest.mark.parametrize("value", ["true", "1", "", None])
def test_production_bat_buoc_tat_hasura_console(value):
    env = {"BAMBOO_ENV": "production", **STRONG}
    if value is None:
        del env["HASURA_ENABLE_CONSOLE"]
    else:
        env["HASURA_ENABLE_CONSOLE"] = value
    expected = ["HASURA_ENABLE_CONSOLE"] if value in ("true", "1") else []
    assert config.production_problems(env) == expected
