#!/usr/bin/env python3
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

"""Smoke test Trợ lý RAG với Ollama thật (ADR #51, #52): chạy `./tools/ai_smoke.sh [--cold]`.

Hỏi bằng tác tử "Trợ lý quy chế" của Tập đoàn X dưới danh tính người tạo tác tử, gọi thẳng dịch vụ actions,
chấm từng câu bằng luật trong `ai_smoke_cases.json` (trạng thái, từ khóa, tài liệu trích dẫn) và in số đo tốc độ:
chữ đầu tiên (từ lúc gửi), tổng thời gian, có phải nạp mô hình không. `--cold` gỡ mô hình khỏi bộ nhớ trước câu đầu.
Mục tiêu tốc độ trên RTX 4060: mô hình đã nạp chữ đầu < 2 giây và cả lượt < 10 giây; nạp lạnh chữ đầu < 8 giây.
"""

import json
import os
import re
import statistics
import subprocess
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ACTIONS = os.environ.get("ACTIONS", "http://127.0.0.1:8090")
SECRET = os.environ.get("ACTIONS_SECRET", "dev-actions-secret")
OLLAMA = os.environ.get("OLLAMA", "http://127.0.0.1:11434")
TIMEOUT = float(os.environ.get("AI_SMOKE_TIMEOUT", "300"))
CASES = Path(__file__).with_name("ai_smoke_cases.json")
NOT_FOUND = ("không tìm thấy", "không có thông tin", "không quy định", "không đề cập", "không có quy định")
WARM_FIRST, WARM_TOTAL, COLD_FIRST = 2.0, 10.0, 8.0


def sql(query: str) -> list[list[str]]:
    out = subprocess.run(
        ["docker", "compose", "exec", "-T", "db", "psql", "-U", "bms", "-d", "bms", "-At", "-F", "\t", "-c", query],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return [line.split("\t") for line in out.splitlines()]


def post(url: str, body: dict, headers: dict | None = None) -> dict:
    req = urllib.request.Request(
        url, json.dumps(body).encode(), {"Content-Type": "application/json", **(headers or {})}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"{}")


def fold(text: str) -> str:
    return unicodedata.normalize("NFC", text).casefold()


def unload_models() -> None:
    for model in ("qwen3:4b", os.environ.get("AI_EMBED_MODEL", "bge-m3")):
        try:
            if "bge" in model:
                post(f"{OLLAMA}/api/embed", {"model": model, "input": [], "keep_alive": 0})
            else:
                post(f"{OLLAMA}/api/generate", {"model": model, "keep_alive": 0, "stream": False})
        except OSError as exc:
            print(f"không gỡ được {model}: {exc}")
    for _ in range(40):
        with urllib.request.urlopen(f"{OLLAMA}/api/ps", timeout=10) as resp:
            if not json.loads(resp.read()).get("models"):
                return
        time.sleep(0.5)
    print("cảnh báo: Ollama vẫn còn mô hình nạp sau 20 giây")


def ask(agent: str, tenant: str, person: str, question: str) -> str:
    body = {
        "input": {"agent_id": agent, "question": question},
        "session_variables": {"x-hasura-role": "user", "x-hasura-user-id": person, "x-hasura-tenant-id": tenant},
    }
    return post(f"{ACTIONS}/actions/ai_ask", body, {"x-actions-secret": SECRET}).get("id", "")


def wait(qid: str) -> dict:
    started = time.monotonic()
    while True:
        [row] = sql(
            f"""SELECT status || coalesce('/' || guard, ''), answer, coalesce(cold_start::text, ''),
                       coalesce(extract(epoch FROM first_token_at - created_at)::numeric(6,2)::text, ''),
                       coalesce(extract(epoch FROM finished_at - created_at)::numeric(6,2)::text, ''),
                       coalesce((SELECT string_agg(c->>'title', '; ') FROM jsonb_array_elements(citations) c), '')
                FROM core.ai_question WHERE id = '{qid}'"""
        )
        if row[0] not in ("queued", "running"):
            break
        if time.monotonic() - started > TIMEOUT:
            row[0] = "timeout"
            break
        time.sleep(0.5)
    num = lambda s: float(s) if s else None
    return {
        "status": row[0],
        "answer": row[1],
        "cold": row[2] == "true",
        "first": num(row[3]),
        "total": num(row[4]),
        "cites": row[5],
    }


def top_scores(ids: list[str], since: str) -> dict[str, str]:
    logs = subprocess.run(
        ["docker", "compose", "logs", "--no-log-prefix", "--since", since, "ai-worker"],
        check=False,
        capture_output=True,
        text=True,
    ).stdout
    found = {}
    for qid in ids:
        m = re.search(rf"lượt hỏi {qid}: (\d+) đoạn vượt ngưỡng ([\d.]+), điểm cao nhất (\S+)", logs)
        found[qid] = f"{m.group(1)} đoạn, điểm {m.group(3)} (ngưỡng {m.group(2)})" if m else ""
    return found


def judge(case: dict, r: dict) -> list[str]:
    problems, text = [], fold(r["answer"])
    want = case["status"]
    leaked = [k for k in case.get("forbid", []) if fold(k) in text or fold(k) in fold(r["cites"])]
    if leaked:
        problems.append(f"lộ nội dung không được phép {leaked}")
    if want == "gan_dung":
        if not (r["status"] == "refused/scope" or (r["status"] == "done" and any(n in text for n in NOT_FOUND))):
            problems.append(f"gần đúng nhưng mô hình vẫn trả lời ({r['status']})")
        return problems
    if r["status"] != want:
        problems.append(f"trạng thái {r['status']}, mong đợi {want}")
        return problems
    missing = [k for k in case.get("keywords", []) if fold(k) not in text]
    if missing:
        problems.append(f"thiếu từ khóa {missing}")
    if case.get("any_of") and not any(fold(k) in text for k in case["any_of"]):
        problems.append(f"không có từ nào trong {case['any_of']}")
    if case.get("cite") and fold(case["cite"]) not in fold(r["cites"]):
        problems.append(f"không trích dẫn '{case['cite']}' (nguồn: {r['cites'] or 'không có'})")
    return problems


def main() -> int:
    cold_first = "--cold" in sys.argv
    cases = json.loads(CASES.read_text())["cases"]
    rows = sql(
        """SELECT a.id, a.tenant_id, a.created_by FROM core.ai_agent a JOIN core.tenant t ON t.id = a.tenant_id
           WHERE t.code = 'TDX' AND a.name = 'Trợ lý quy chế' LIMIT 1"""
    )
    if not rows:
        print("Không thấy tác tử 'Trợ lý quy chế' (chạy seed demo trước)")
        return 1
    agent, tenant, person = rows[0]
    pending = sql("SELECT count(*) FROM search.pending_chunk WHERE dirty")[0][0]
    print(
        f"tác tử {agent} · đoạn chờ nạp: {pending} · {len(cases)} câu · {'nạp lạnh' if cold_first else 'giữ nguyên bộ nhớ'}"
    )
    if cold_first:
        unload_models()

    start = time.time()
    results, failed = [], 0
    for case in cases:
        qid = ask(agent, tenant, person, case["q"])
        if not qid:
            print(f"FAIL {case['q']} (ai_ask không trả id)")
            failed += 1
            continue
        r = wait(qid)
        problems = judge(case, r)
        failed += bool(problems)
        results.append((case, qid, r, problems))
        speed = (
            f"chữ đầu {r['first']}s · cả lượt {r['total']}s{' · nạp lạnh' if r['cold'] else ''}" if r["first"] else "—"
        )
        print(f"{'ok  ' if not problems else 'FAIL'} [{case['group']}] {case['q']}\n     → {r['status']} · {speed}")
        for p in problems:
            print(f"     ! {p}")
    scores = top_scores([qid for _, qid, _, _ in results], f"{int(time.time() - start) + 30}s")
    print("\nĐiểm tìm kiếm cao nhất theo nhóm (để hiệu chỉnh AI_MIN_SCORE):")
    for group in dict.fromkeys(c["group"] for c, *_ in results):
        print(f"  {group}: " + " | ".join(scores[qid] or "—" for c, qid, *_ in results if c["group"] == group))

    answered = [r for _, _, r, _ in results if r["first"] is not None]
    warm, cold = [r for r in answered if not r["cold"]], [r for r in answered if r["cold"]]
    print("\nTốc độ (giây):")
    for name, rs, first_goal, total_goal in (
        ("đã nạp", warm, WARM_FIRST, WARM_TOTAL),
        ("nạp lạnh", cold, COLD_FIRST, None),
    ):
        if rs:
            f, t = statistics.median(r["first"] for r in rs), statistics.median(r["total"] for r in rs)
            ok = f < first_goal and (total_goal is None or t < total_goal)
            print(
                f"  {name}: {len(rs)} lượt, trung vị chữ đầu {f:.1f} (mục tiêu < {first_goal}), cả lượt {t:.1f}"
                f"{f' (mục tiêu < {total_goal})' if total_goal else ''} {'đạt' if ok else 'CHƯA ĐẠT'}"
            )
    print(f"\nKết quả: {len(results) - failed} ok, {failed} lỗi.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
