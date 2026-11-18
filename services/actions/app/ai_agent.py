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

"""Tác tử AI và Trợ lý RAG (ADR #51).

Quản trị (cần core.ai.manage, kiểm qua core.v_ai_admin): ai_agent_register, ai_agent_update,
ai_agent_unregister, ai_models, ai_agent_stats; tự hành động khi có sự kiện (ADR #72): ai_agent_automation,
ai_agent_trigger_options (lần chạy trong core.ai_agent_run, ai-worker thực hiện qua ai_agent_runner).
Người dùng: ai_assistants (tác tử hỏi được), ai_ask (lưu lượt hỏi, worker nền trả lời dần). Trợ lý trả lời, từ chối
và báo lỗi bằng ngôn ngữ của câu hỏi (ADR #85): `reply_language`, `notice`.
Nhật ký kiểm toán bật qua audit.enable('core.ai_agent') và trigger audit_log trên core.ai_question.
"""

import logging
import re
import unicodedata

import psycopg
from psycopg.types.json import Jsonb

from bamboo_common.ollama import WAKE_SECONDS, OllamaUnavailable

from . import i18n, lang, pii_guard
from .common import ActionError, Context, bind_session

log = logging.getLogger("ai_agent")

AI_MANAGE = "core.ai.manage"
TOOLS = ("search_docs", "cite")
GUARDRAILS = ("scope_guard", "pii_guard", "prompt_guard")
DEFAULT_GUARDRAILS = {"scope_guard": True, "pii_guard": True, "prompt_guard": True, "think": False}
MAX_QUESTION = 2000
PROMPT_REFUSAL = "Câu hỏi có dấu hiệu cố tình thay đổi chỉ dẫn của trợ lý nên không được xử lý."

INJECTION_PATTERNS = (
    r"\bbo qua\s+(?:(?:moi|cac|tat ca|nhung)\s+)*(?:huong dan|chi dan|lenh|quy tac)",
    r"\bignore\s+(?:(?:all|any|previous|prior|the above|above)\s+)*(?:instructions|rules|prompts?)",
    r"\bsystem\s*prompt",
    r"\bban bay gio la\b",
    r"\byou are now\b",
    r"\bdong vai\b(?!\s+tro)",
    r"</?\s*(?:tai_lieu|doan)\b",
    r"\bjailbreak",
)
CASE_SENSITIVE_PATTERNS = (r"\bDAN\b",)
_INJECTION = re.compile("|".join(INJECTION_PATTERNS))
_INJECTION_CS = re.compile("|".join(CASE_SENSITIVE_PATTERNS))


def fold(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn").lower()


def is_injection(text: str) -> bool:
    return bool(_INJECTION.search(fold(text)) or _INJECTION_CS.search(text))


def reply_language(conn: psycopg.Connection, tenant, person, question: str) -> str:
    """Ngôn ngữ trả lời một câu hỏi: ngôn ngữ của chính câu hỏi; câu quá ít chữ để biết (chỉ có mã, số) thì theo ngôn
    ngữ giao diện mà người hỏi đã chọn."""
    found = lang.detect(question)
    if found:
        return found
    return lang.EN if i18n.person_locale(conn, tenant, person) == "en" else lang.VI


def notice(text: str, language: str) -> str:
    """Câu cố định của trợ lý (từ chối, báo lỗi) theo ngôn ngữ trả lời: tiếng Việt, mọi ngôn ngữ khác dùng tiếng Anh."""
    return i18n.message(text, "vi" if language == lang.VI else "en")


def guardrails(config: dict | None) -> dict:
    return {**DEFAULT_GUARDRAILS, **{k: bool(v) for k, v in (config or {}).items() if k in DEFAULT_GUARDRAILS}}


def _identity(session: dict) -> tuple[str, str]:
    person = session.get("x-hasura-user-id")
    tenant = session.get("x-hasura-tenant-id")
    if not person or not tenant:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    return person, tenant


def _require_admin(conn: psycopg.Connection, person: str, tenant: str) -> None:
    """Kiểm tra người gọi có quyền core.ai.manage trong tenant."""
    ok = conn.execute(
        """SELECT 1 FROM core.v_ai_admin
           WHERE tenant_id = %s AND person_id = %s LIMIT 1""",
        (tenant, person),
    ).fetchone()
    if not ok:
        raise ActionError("Bạn không có quyền quản trị tác tử AI", "forbidden", 403)


def _text(data: dict, key: str, label: str, required: bool = True) -> str | None:
    value = data.get(key)
    value = str(value).strip() if value is not None else ""
    if not value:
        if required:
            raise ActionError(f"Thiếu {label}")
        return None
    return value


def _json_object(data: dict, key: str, label: str, required: bool = True) -> dict | None:
    value = data.get(key)
    if value is None:
        if required:
            raise ActionError(f"Thiếu {label}")
        return None
    if not isinstance(value, dict):
        raise ActionError(f"{label} phải là đối tượng JSON")
    return value


def _json_array(data: dict, key: str, label: str, required: bool = True) -> list | None:
    value = data.get(key)
    if value is None:
        if required:
            raise ActionError(f"Thiếu {label}")
        return None
    if not isinstance(value, list):
        raise ActionError(f"{label} phải là mảng JSON")
    return value


def _tools(args: dict, required: bool) -> list | None:
    tools = _json_array(args, "tool_list", "danh sách công cụ", required=False)
    if tools is None:
        return list(TOOLS) if required else None
    unknown = [t for t in tools if t not in TOOLS]
    if unknown:
        raise ActionError(f"Công cụ chưa hỗ trợ: {', '.join(map(str, unknown))} (chỉ có {', '.join(TOOLS)})")
    return list(dict.fromkeys(tools))


def _model_names(ctx: Context) -> set[str] | None:
    """Tên mô hình Ollama đang có; None khi AI chưa bật hoặc không truy cập được."""
    if ctx.ai is None:
        return None
    try:
        return {m["name"] for m in ctx.ai.models(timeout=WAKE_SECONDS)}
    except OllamaUnavailable as exc:
        log.info("Ollama không truy cập được: %s", exc)
        return None


def _check_model(ctx: Context, model: str) -> None:
    names = _model_names(ctx)
    if names is not None and model not in names and f"{model}:latest" not in names:
        raise ActionError(f"Ollama chưa có mô hình {model}", "model-not-found")


def _agent_out(row) -> dict:
    return {
        "id": str(row[0]),
        "name": row[1],
        "model": row[2],
        "status": row[3],
        "guardrail_config": guardrails(row[4]),
        "tool_list": row[5],
    }


def ai_agent_register(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Đăng ký tác tử AI mới: name, model (tên trong Ollama), status, guardrail_config, tool_list."""
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    bind_session(conn, session)

    name = _text(args, "name", "tên tác tử")
    model = _text(args, "model", "mô hình AI")
    status = _text(args, "status", "trạng thái", required=False) or "active"
    if status not in ("active", "inactive"):
        raise ActionError("Trạng thái phải là 'active' hoặc 'inactive'")
    _check_model(ctx, model)
    config = guardrails(_json_object(args, "guardrail_config", "cấu hình guardrail", required=False))

    row = conn.execute(
        """INSERT INTO core.ai_agent (tenant_id, name, model, status, guardrail_config, tool_list, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           RETURNING id, name, model, status, guardrail_config, tool_list""",
        (tenant, name, model, status, Jsonb(config), Jsonb(_tools(args, required=True)), person),
    ).fetchone()
    return _agent_out(row)


def ai_agent_update(conn: psycopg.Connection, session: dict, args: dict, ctx: Context) -> dict:
    """Cập nhật tác tử AI theo id; chỉ đổi các trường có truyền."""
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    bind_session(conn, session)

    agent_id = args.get("id")
    if not agent_id:
        raise ActionError("Thiếu id tác tử")
    existing = conn.execute(
        "SELECT guardrail_config FROM core.ai_agent WHERE id = %s AND tenant_id = %s", (agent_id, tenant)
    ).fetchone()
    if not existing:
        raise ActionError("Không tìm thấy tác tử AI", "not-found", 404)

    updates, params = [], []
    name = _text(args, "name", "tên tác tử", required=False)
    if name is not None:
        updates.append("name = %s")
        params.append(name)
    model = _text(args, "model", "mô hình AI", required=False)
    if model is not None:
        _check_model(ctx, model)
        updates.append("model = %s")
        params.append(model)
    status = _text(args, "status", "trạng thái", required=False)
    if status is not None:
        if status not in ("active", "inactive"):
            raise ActionError("Trạng thái phải là 'active' hoặc 'inactive'")
        updates.append("status = %s")
        params.append(status)
    config = _json_object(args, "guardrail_config", "cấu hình guardrail", required=False)
    if config is not None:
        updates.append("guardrail_config = %s")
        params.append(Jsonb(guardrails({**guardrails(existing[0]), **config})))
    tools = _tools(args, required=False)
    if tools is not None:
        updates.append("tool_list = %s")
        params.append(Jsonb(tools))
    if not updates:
        raise ActionError("Không có trường nào để cập nhật")

    row = conn.execute(
        f"""UPDATE core.ai_agent SET {", ".join(updates)}
            WHERE id = %s AND tenant_id = %s
            RETURNING id, name, model, status, guardrail_config, tool_list""",
        (*params, agent_id, tenant),
    ).fetchone()
    return _agent_out(row)


def ai_agent_unregister(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Xóa tác tử chưa có lượt hỏi; tác tử đã có lượt hỏi thì chỉ ngừng kích hoạt để giữ lịch sử."""
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    bind_session(conn, session)

    agent_id = args.get("id")
    if not agent_id:
        raise ActionError("Thiếu id tác tử")
    if not conn.execute(
        "SELECT 1 FROM core.ai_agent WHERE id = %s AND tenant_id = %s FOR UPDATE", (agent_id, tenant)
    ).fetchone():
        raise ActionError("Không tìm thấy tác tử AI", "not-found", 404)
    if conn.execute(
        """SELECT 1 FROM core.ai_question WHERE agent_id = %s
           UNION ALL SELECT 1 FROM core.ai_agent_run WHERE agent_id = %s LIMIT 1""",
        (agent_id, agent_id),
    ).fetchone():
        conn.execute("UPDATE core.ai_agent SET status = 'inactive' WHERE id = %s", (agent_id,))
        return {
            "id": str(agent_id),
            "deleted": False,
            "message": "Tác tử đã có lượt hỏi hoặc lần tự hành động nên chỉ ngừng kích hoạt",
        }
    conn.execute("DELETE FROM core.ai_agent WHERE id = %s", (agent_id,))
    return {"id": str(agent_id), "deleted": True, "message": "Đã xóa tác tử AI"}


def ai_models(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    if ctx.ai is None:
        return {"ai_enabled": False, "models": []}
    try:
        models = ctx.ai.models(timeout=WAKE_SECONDS)
    except OllamaUnavailable:
        return {"ai_enabled": False, "models": [], "loaded": []}
    try:
        loaded = ctx.ai.running()
    except OllamaUnavailable:
        loaded = []
    return {"ai_enabled": True, "models": models, "loaded": loaded}


def ai_agent_stats(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> list[dict]:
    """Số liệu theo tác tử trong `days` ngày gần nhất; không trả nội dung lượt hỏi."""
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    days = max(1, min(int(args.get("days") or 7), 90))
    rows = conn.execute(
        """SELECT a.id, count(q.id),
                  count(q.id) FILTER (WHERE q.status = 'done'),
                  avg(extract(epoch FROM q.finished_at - q.started_at)) FILTER (WHERE q.status = 'done'),
                  percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM q.finished_at - q.started_at))
                      FILTER (WHERE q.status = 'done'),
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM q.first_token_at - q.started_at))
                      FILTER (WHERE q.status = 'done' AND q.first_token_at IS NOT NULL),
                  count(q.id) FILTER (WHERE q.cold_start),
                  count(q.id) FILTER (WHERE q.guard = 'scope'),
                  count(q.id) FILTER (WHERE q.guard = 'prompt'),
                  count(q.id) FILTER (WHERE q.status = 'error'),
                  count(q.id) FILTER (WHERE q.status IN ('queued', 'running')),
                  coalesce(sum(q.prompt_tokens), 0), coalesce(sum(q.completion_tokens), 0),
                  count(q.id) FILTER (WHERE q.reused_from IS NOT NULL),
                  count(q.id) FILTER (WHERE q.attempts > 0),
                  sum(q.completion_tokens) FILTER (WHERE q.status = 'done' AND q.finished_at > q.first_token_at)
                      / nullif(sum(extract(epoch FROM q.finished_at - q.first_token_at))
                               FILTER (WHERE q.status = 'done' AND q.finished_at > q.first_token_at
                                         AND q.completion_tokens IS NOT NULL), 0),
                  avg(q.prompt_tokens) FILTER (WHERE q.status = 'done' AND q.reused_from IS NULL)
           FROM core.ai_agent a
           LEFT JOIN core.ai_question q ON q.agent_id = a.id AND q.created_at > now() - make_interval(days => %s)
           WHERE a.tenant_id = %s
           GROUP BY a.id ORDER BY a.id""",
        (days, tenant),
    ).fetchall()
    return [
        {
            "agent_id": str(r[0]),
            "questions": r[1],
            "answered": r[2],
            "avg_seconds": round(float(r[3]), 1) if r[3] is not None else None,
            "p90_seconds": round(float(r[4]), 1) if r[4] is not None else None,
            "first_token_seconds": round(float(r[5]), 1) if r[5] is not None else None,
            "cold_starts": r[6],
            "scope_refused": r[7],
            "prompt_refused": r[8],
            "errors": r[9],
            "pending": r[10],
            "prompt_tokens": r[11],
            "completion_tokens": r[12],
            "reused": r[13],
            "retried": r[14],
            "tokens_per_second": round(float(r[15]), 1) if r[15] is not None else None,
            "avg_context_tokens": round(float(r[16])) if r[16] is not None else None,
        }
        for r in rows
    ]


def _askable(tools) -> bool:
    return isinstance(tools, list) and all(t in tools for t in TOOLS)


DEFAULT_ASSISTANT = "Trợ lý tri thức"


def ensure_default_assistant(conn: psycopg.Connection, tenant, person, model: str) -> bool:
    """Công ty chưa từng có tác tử AI nào thì tạo một trợ lý hỏi đáp Thư viện tri thức, để mọi người trong công ty
    dùng được ngay khi bật mô-đun AI. Công ty đã có tác tử (kể cả đã ngừng) thì giữ nguyên quyết định của quản trị."""
    if not model:
        return False
    conn.execute("SELECT pg_advisory_xact_lock(hashtext('core.ai_agent.default:' || %s::text))", (str(tenant),))
    row = conn.execute(
        """INSERT INTO core.ai_agent (tenant_id, name, model, tool_list, created_by)
           SELECT %s, %s, %s, %s, %s
           WHERE NOT EXISTS (SELECT FROM core.ai_agent WHERE tenant_id = %s)
           RETURNING id""",
        (tenant, DEFAULT_ASSISTANT, model, Jsonb(list(TOOLS)), person, tenant),
    ).fetchone()
    if row:
        log.info("tạo trợ lý AI mặc định %s cho tenant %s", row[0], tenant)
    return row is not None


def ai_assistants(conn: psycopg.Connection, session: dict, _args: dict, ctx: Context) -> dict:
    """Tác tử đang hoạt động hỏi được tài liệu (search_docs + cite) và AI có đang bật không."""
    person, tenant = _identity(session)
    ensure_default_assistant(conn, tenant, person, ctx.ai_chat_model)
    rows = conn.execute(
        """SELECT id, name, model FROM core.ai_agent
           WHERE tenant_id = %s AND status = 'active' AND tool_list @> '["search_docs", "cite"]'::jsonb
           ORDER BY name""",
        (tenant,),
    ).fetchall()
    names = _model_names(ctx)
    return {
        "ai_enabled": names is not None,
        "assistants": [
            {
                "id": str(r[0]),
                "name": r[1],
                "model": r[2],
                "ready": names is not None and (r[2] in names or f"{r[2]}:latest" in names),
            }
            for r in rows
        ],
    }


def queue_position(conn: psycopg.Connection, question_id) -> int:
    return conn.execute(
        """SELECT count(*) FROM core.ai_question o, core.ai_question q
           WHERE q.id = %s AND q.status = 'queued' AND o.status IN ('queued', 'running')
             AND o.created_at < q.created_at""",
        (question_id,),
    ).fetchone()[0]


def ai_ask(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Lưu một lượt hỏi và trả ngay; worker ai_worker trả lời dần, giao diện theo dõi qua subscription."""
    person, tenant = _identity(session)
    agent = conn.execute(
        """SELECT id, model, guardrail_config, tool_list FROM core.ai_agent
           WHERE id = %s AND tenant_id = %s AND status = 'active'""",
        (args.get("agent_id"), tenant),
    ).fetchone()
    if agent is None or not _askable(agent[3]):
        raise ActionError("Không tìm thấy trợ lý AI đang hoạt động", "not-found", 404)
    question = " ".join(str(args.get("question") or "").split())
    if not question:
        raise ActionError("Nhập câu hỏi", "question-required")
    if len(question) > MAX_QUESTION:
        raise ActionError(f"Câu hỏi tối đa {MAX_QUESTION} ký tự")
    doc_id = args.get("kb_document_id")
    if (
        doc_id
        and not conn.execute(
            """SELECT 1 FROM collab.kb_document d
           WHERE d.id = %s AND d.tenant_id = %s AND d.status = 'APPROVED'
             AND collab.kb_can_read_published(d, %s)""",
            (doc_id, tenant, person),
        ).fetchone()
    ):
        raise ActionError("Không tìm thấy tài liệu", "not-found", 404)

    guard = guardrails(agent[2])
    refused = guard["prompt_guard"] and is_injection(question)
    refusal = notice(PROMPT_REFUSAL, reply_language(conn, tenant, person, question)) if refused else ""
    if guard["pii_guard"]:
        question, _ = pii_guard.guard().mask(question)
    bind_session(conn, session)
    row = conn.execute(
        """INSERT INTO core.ai_question (tenant_id, agent_id, person_id, question, kb_document_id, model,
                                        status, guard, answer, started_at, finished_at)
           SELECT %s, %s, %s, %s, %s, %s,
                  CASE WHEN r THEN 'refused' ELSE 'queued' END, CASE WHEN r THEN 'prompt' END,
                  CASE WHEN r THEN %s ELSE '' END, CASE WHEN r THEN now() END, CASE WHEN r THEN now() END
           FROM (SELECT %s::boolean AS r) f
           RETURNING id, status""",
        (tenant, agent[0], person, question, doc_id or None, agent[1], refusal, refused),
    ).fetchone()
    return {"id": str(row[0]), "status": row[1], "position": 0 if refused else queue_position(conn, row[0])}


AGENT_ACTIONS = {
    "comment": "Bình luận vào chứng từ (đứng tên người phụ trách tác tử)",
    "notify": "Gửi thông báo cho người lập, người đang duyệt hoặc người phụ trách tác tử",
    "webhook": "Gửi kết quả đánh giá tới webhook HTTPS đã khai",
}
AUTONOMY = {"act": "Tự thực hiện", "dry_run": "Chỉ đề xuất, không thực hiện"}
MAX_TRIGGERS = 10


def _events() -> dict[str, str]:
    from .process_automation import EVENTS

    return EVENTS


def _automation_out(row) -> dict:
    return {
        "id": str(row[0]),
        "triggers": row[1],
        "instructions": row[2],
        "allowed_actions": row[3],
        "autonomy": row[4],
        "webhook_url": row[5],
    }


def ai_agent_automation(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    """Đặt sự kiện kích hoạt, nhiệm vụ và hành động được phép của tác tử. triggers rỗng là tắt tự hành động."""
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    bind_session(conn, session)
    agent_id = args.get("id")
    if not conn.execute(
        "SELECT 1 FROM core.ai_agent WHERE id = %s AND tenant_id = %s FOR UPDATE", (agent_id, tenant)
    ).fetchone():
        raise ActionError("Không tìm thấy tác tử AI", "not-found", 404)

    triggers = list(dict.fromkeys(_json_array(args, "triggers", "sự kiện kích hoạt") or []))
    events = _events()
    unknown = [t for t in triggers if t not in events]
    if unknown:
        raise ActionError(f"Sự kiện chưa hỗ trợ: {', '.join(map(str, unknown))}")
    if len(triggers) > MAX_TRIGGERS:
        raise ActionError(f"Tối đa {MAX_TRIGGERS} sự kiện cho một tác tử")
    allowed = list(dict.fromkeys(_json_array(args, "allowed_actions", "hành động được phép") or []))
    bad = [a for a in allowed if a not in AGENT_ACTIONS]
    if bad:
        raise ActionError(f"Hành động chưa hỗ trợ: {', '.join(map(str, bad))} (chỉ có {', '.join(AGENT_ACTIONS)})")
    instructions = _text(args, "instructions", "nhiệm vụ của tác tử", required=bool(triggers))
    if instructions and len(instructions) > 4000:
        raise ActionError("Nhiệm vụ tối đa 4000 ký tự")
    if instructions and is_injection(instructions):
        raise ActionError("Nhiệm vụ có dấu hiệu thay đổi chỉ dẫn hệ thống của tác tử")
    autonomy = _text(args, "autonomy", "mức tự chủ", required=False) or "act"
    if autonomy not in AUTONOMY:
        raise ActionError("Mức tự chủ phải là 'act' hoặc 'dry_run'")
    webhook = _text(args, "webhook_url", "địa chỉ webhook", required="webhook" in allowed)
    if webhook and not webhook.startswith("https://"):
        raise ActionError("Webhook phải dùng https://")

    row = conn.execute(
        """UPDATE core.ai_agent SET triggers = %s, instructions = %s, allowed_actions = %s, autonomy = %s,
                  webhook_url = %s
           WHERE id = %s RETURNING id, triggers, instructions, allowed_actions, autonomy, webhook_url""",
        (triggers, instructions, allowed, autonomy, webhook, agent_id),
    ).fetchone()
    return _automation_out(row)


def ai_agent_trigger_options(conn: psycopg.Connection, session: dict, _args: dict, _ctx: Context) -> dict:
    person, tenant = _identity(session)
    _require_admin(conn, person, tenant)
    return {
        "events": [{"code": k, "label": v} for k, v in _events().items()],
        "actions": [{"code": k, "label": v} for k, v in AGENT_ACTIONS.items()],
        "autonomy": [{"code": k, "label": v} for k, v in AUTONOMY.items()],
    }


HANDLERS = {
    "ai_agent_register": ai_agent_register,
    "ai_agent_update": ai_agent_update,
    "ai_agent_unregister": ai_agent_unregister,
    "ai_models": ai_models,
    "ai_agent_stats": ai_agent_stats,
    "ai_assistants": ai_assistants,
    "ai_ask": ai_ask,
    "ai_agent_automation": ai_agent_automation,
    "ai_agent_trigger_options": ai_agent_trigger_options,
}
