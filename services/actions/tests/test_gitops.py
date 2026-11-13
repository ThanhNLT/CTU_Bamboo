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

import json
import os
import pathlib
import stat
import subprocess

import pytest

from conftest import ROOT

SCRIPT = ROOT / "tools" / "gitops" / "reconcile.sh"

FAKE_DOCKER = """#!/usr/bin/env bash
# docker giả: `compose -p P config --hash '*'`, `compose -p P ps --format ...`, `compose -p P up -d ...`
echo "$*" >> "$FAKE_LOG"
case "$*" in
  *"config --hash"*) cat "$FAKE_CONFIG" ;;
  *" ps "*) cat "$FAKE_PS" ;;
  *" up "*) [ -f "$FAKE_UP_FAILS" ] && exit 1; exit 0 ;;
esac
"""


def git(cwd, *args):
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env={
            **os.environ,
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@t",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@t",
        },
    ).stdout.strip()


@pytest.fixture
def world(tmp_path):
    origin, work = tmp_path / "origin.git", tmp_path / "work"
    git(tmp_path, "init", "--bare", "-b", "main", str(origin))
    git(tmp_path, "clone", str(origin), str(work))
    (work / "a.txt").write_text("1")
    git(work, "add", ".")
    git(work, "commit", "-m", "đầu")
    git(work, "push", "origin", "HEAD:main")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(FAKE_DOCKER)
    docker.chmod(docker.stat().st_mode | stat.S_IEXEC)
    (tmp_path / "config").write_text("web aaaa\ndb bbbb\n")
    (tmp_path / "ps").write_text("web running healthy\ndb running healthy\n")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "REPO_DIR": str(work),
        "STATE_FILE": str(tmp_path / "state.json"),
        "FAKE_LOG": str(tmp_path / "log"),
        "FAKE_CONFIG": str(tmp_path / "config"),
        "FAKE_PS": str(tmp_path / "ps"),
        "FAKE_UP_FAILS": str(tmp_path / "up-fails"),
    }
    return {"origin": origin, "work": work, "env": env, "tmp": tmp_path}


def reconcile(w, *args):
    result = subprocess.run(["bash", str(SCRIPT), *args], env=w["env"], capture_output=True, text=True, timeout=60)
    state = (
        json.loads(pathlib.Path(w["env"]["STATE_FILE"]).read_text())
        if pathlib.Path(w["env"]["STATE_FILE"]).exists()
        else {}
    )
    ups = (
        [line for line in pathlib.Path(w["env"]["FAKE_LOG"]).read_text().splitlines() if " up " in line]
        if pathlib.Path(w["env"]["FAKE_LOG"]).exists()
        else []
    )
    return result, state, ups


def test_lan_dau_ap_dung_roi_khop_thi_khong_lam_gi(world):
    result, state, ups = reconcile(world)
    assert (
        result.returncode == 0 and state["status"] == "applied" and len(ups) == 1 and "up -d --remove-orphans" in ups[0]
    )
    result, state, ups = reconcile(world)
    assert result.returncode == 0 and state["status"] == "in-sync" and len(ups) == 1, "khớp thì không chạy lại"


def test_commit_moi_duoc_keo_va_ap_dung(world):
    reconcile(world)
    pusher = world["tmp"] / "pusher"
    git(world["tmp"], "clone", str(world["origin"]), str(pusher))
    (pusher / "a.txt").write_text("2")
    git(pusher, "commit", "-am", "đổi cấu hình")
    git(pusher, "push", "origin", "HEAD:main")
    (world["tmp"] / "config").write_text("web cccc\ndb bbbb\n")
    result, state, ups = reconcile(world)
    assert result.returncode == 0 and state["status"] == "applied" and len(ups) == 2
    assert (world["work"] / "a.txt").read_text() == "2", "đã kéo bản mới"


def test_dich_vu_lech_duoc_dua_ve_dung_cau_hinh(world):
    reconcile(world)
    (world["tmp"] / "ps").write_text("web exited \ndb running unhealthy\n")
    result, state, ups = reconcile(world)
    assert (
        state["status"] == "applied"
        and "web(exited)" in state["note"]
        and "db(running/unhealthy)" in state["note"]
        and len(ups) == 2
    )


def test_lich_su_bi_viet_lai_thi_dung_lai(world):
    reconcile(world)
    pusher = world["tmp"] / "pusher"
    git(world["tmp"], "clone", str(world["origin"]), str(pusher))
    git(pusher, "reset", "--hard", "HEAD")
    (pusher / "b.txt").write_text("x")
    git(pusher, "add", ".")
    git(pusher, "commit", "--amend", "-m", "viết lại lịch sử")
    git(pusher, "push", "--force", "origin", "HEAD:main")
    result, state, ups = reconcile(world)
    assert (
        result.returncode == 1
        and state["status"] == "error"
        and "không phải kế thừa" in state["note"]
        and len(ups) == 1
    )


def test_loi_up_va_dry_run(world):
    (world["tmp"] / "up-fails").write_text("")
    result, state, ups = reconcile(world)
    assert result.returncode == 1 and state["status"] == "error" and "up thất bại" in state["note"]
    (world["tmp"] / "up-fails").unlink()
    result, state, ups = reconcile(world, "--dry-run")
    assert result.returncode == 0 and "dry-run" in result.stdout and len(ups) == 1, "dry-run không áp dụng"
