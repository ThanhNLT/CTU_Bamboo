import datetime as dt
from decimal import Decimal

import psycopg
from psycopg.rows import dict_row

from .common import ActionError, Context

TABS = {"process", "production", "hospital", "quality", "sites"}
SLA_HOURS = 48
TZ = "Asia/Ho_Chi_Minh"
ENTITY_LABEL = {
    "proc.purchase_request": "Đề nghị mua sắm",
    "hr.onboarding_request": "Tiếp nhận nhân sự",
    "collab.kb_document": "Đề xuất tài liệu",
}
VISIBLE = """vis AS (
    SELECT DISTINCT s.entity_type, s.entity_id FROM wf.approval_step s
    WHERE s.tenant_id = %(tenant)s AND wf.entity_can_read(s.entity_type, s.entity_id, %(person)s))"""


def _plain(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, dt.datetime | dt.date):
        return v.isoformat()
    if isinstance(v, list):
        return [_plain(x) for x in v]
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    return str(v) if v is not None and not isinstance(v, str | int | float | bool) else v


def _rows(conn: psycopg.Connection, sql: str, params: dict) -> list[dict]:
    return [_plain(r) for r in conn.cursor(row_factory=dict_row).execute(sql, params).fetchall()]


def _one(conn: psycopg.Connection, sql: str, params: dict) -> dict:
    return _plain(conn.cursor(row_factory=dict_row).execute(sql, params).fetchone())


def _bucket(days: int) -> str:
    return "day" if days <= 31 else "week"


def _root(conn: psycopg.Connection, tenant) -> str:
    return conn.execute(
        "SELECT id FROM core.org_unit WHERE tenant_id = %s AND parent_id IS NULL ORDER BY created_at LIMIT 1",
        (tenant,),
    ).fetchone()[0]


def _group_reader(conn: psycopg.Connection, person: str, tenant) -> bool:
    return conn.execute(
        "SELECT core.has_permission(%s, 'ops.group.read', %s)", (person, _root(conn, tenant))
    ).fetchone()[0]


def process_tab(conn: psycopg.Connection, p: dict) -> dict:
    events = _rows(
        conn,
        f"""WITH {VISIBLE}
            SELECT h.entity_type, h.event, count(*)::int AS n
            FROM wf.approval_history h JOIN vis USING (entity_type, entity_id)
            WHERE h.tenant_id = %(tenant)s AND h.created_at >= now() - make_interval(days => %(days)s)
              AND h.event IN ('SUBMITTED', 'COMPLETED', 'REJECTED', 'RETURNED', 'CANCELLED')
            GROUP BY 1, 2""",
        p,
    )
    cycle = _rows(
        conn,
        f"""WITH {VISIBLE}, done AS (
                SELECT c.entity_type, extract(epoch FROM c.created_at - s.created_at) / 3600 AS hours
                FROM wf.approval_history c JOIN vis USING (entity_type, entity_id)
                CROSS JOIN LATERAL (
                    SELECT s.created_at FROM wf.approval_history s
                    WHERE s.entity_type = c.entity_type AND s.entity_id = c.entity_id AND s.event = 'SUBMITTED'
                      AND s.created_at <= c.created_at
                    ORDER BY s.created_at DESC LIMIT 1) s
                WHERE c.tenant_id = %(tenant)s AND c.event = 'COMPLETED'
                  AND c.created_at >= now() - make_interval(days => %(days)s))
            SELECT coalesce(entity_type, '*') AS entity_type, count(*)::int AS n,
                   round(avg(hours)::numeric, 1) AS avg_hours,
                   round(percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 1) AS p50_hours,
                   round(percentile_cont(0.9) WITHIN GROUP (ORDER BY hours)::numeric, 1) AS p90_hours
            FROM done GROUP BY ROLLUP (entity_type)""",
        p,
    )
    open_tasks = _rows(
        conn,
        f"""WITH {VISIBLE}
            SELECT s.entity_type, count(*)::int AS open,
                   count(*) FILTER (WHERE t.created_at < now() - make_interval(hours => %(sla)s))::int AS overdue
            FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
            JOIN vis ON vis.entity_type = s.entity_type AND vis.entity_id = s.entity_id
            WHERE t.tenant_id = %(tenant)s AND t.status = 'OPEN'
            GROUP BY 1""",
        p,
    )
    trend = _rows(
        conn,
        f"""WITH {VISIBLE}, b AS (
                SELECT generate_series(date_trunc(%(bucket)s, (now() - make_interval(days => %(days)s - 1))
                                                             AT TIME ZONE %(tz)s),
                                       date_trunc(%(bucket)s, now() AT TIME ZONE %(tz)s),
                                       ('1 ' || %(bucket)s)::interval) AS at)
            SELECT to_char(b.at, 'YYYY-MM-DD') AS at,
                   count(h.*) FILTER (WHERE h.event = 'SUBMITTED')::int AS submitted,
                   count(h.*) FILTER (WHERE h.event = 'COMPLETED')::int AS completed,
                   count(h.*) FILTER (WHERE h.event IN ('REJECTED', 'RETURNED', 'CANCELLED'))::int AS other
            FROM b LEFT JOIN (
                SELECT h.event, date_trunc(%(bucket)s, h.created_at AT TIME ZONE %(tz)s) AS at
                FROM wf.approval_history h JOIN vis USING (entity_type, entity_id)
                WHERE h.tenant_id = %(tenant)s AND h.created_at >= now() - make_interval(days => %(days)s)
            ) h ON h.at = b.at
            GROUP BY b.at ORDER BY b.at""",
        p,
    )
    bottlenecks = _rows(
        conn,
        f"""WITH {VISIBLE}
            SELECT pos.name AS position, u.name AS unit,
                   count(*) FILTER (WHERE t.status <> 'OPEN')::int AS closed,
                   round((avg(extract(epoch FROM t.closed_at - t.created_at) / 3600)
                          FILTER (WHERE t.status <> 'OPEN'))::numeric, 1) AS avg_hours,
                   count(*) FILTER (WHERE t.status = 'OPEN')::int AS open,
                   count(*) FILTER (WHERE t.status = 'OPEN'
                                      AND t.created_at < now() - make_interval(hours => %(sla)s))::int AS overdue,
                   round((max(extract(epoch FROM now() - t.created_at) / 3600)
                          FILTER (WHERE t.status = 'OPEN'))::numeric, 1) AS oldest_open_hours
            FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
            JOIN vis ON vis.entity_type = s.entity_type AND vis.entity_id = s.entity_id
            JOIN core.position pos ON pos.id = t.assigned_position_id
            JOIN core.org_unit u ON u.id = pos.org_unit_id
            WHERE t.tenant_id = %(tenant)s
              AND (t.status = 'OPEN' OR t.closed_at >= now() - make_interval(days => %(days)s))
            GROUP BY pos.id, pos.name, u.name
            ORDER BY overdue DESC, avg_hours DESC NULLS LAST, open DESC
            LIMIT 8""",
        p,
    )
    by_type: dict[str, dict] = {
        t: {"entity_type": t, "label": label, "submitted": 0, "completed": 0, "rejected": 0, "returned": 0,
            "cancelled": 0, "open": 0, "overdue": 0, "avg_hours": None, "p90_hours": None}
        for t, label in ENTITY_LABEL.items()
    }  # fmt: skip
    for e in events:
        if e["entity_type"] in by_type:
            by_type[e["entity_type"]][e["event"].lower()] = e["n"]
    for o in open_tasks:
        if o["entity_type"] in by_type:
            by_type[o["entity_type"]].update(open=o["open"], overdue=o["overdue"])
    overall = {"n": 0, "avg_hours": None, "p50_hours": None, "p90_hours": None}
    for c in cycle:
        if c["entity_type"] == "*":
            overall = c
        elif c["entity_type"] in by_type:
            by_type[c["entity_type"]].update(avg_hours=c["avg_hours"], p90_hours=c["p90_hours"])
    rows = list(by_type.values())
    total = {k: sum(r[k] for r in rows) for k in ("submitted", "completed", "rejected", "returned", "cancelled")}
    decided = total["completed"] + total["rejected"] + total["cancelled"]
    return {
        "totals": {
            **total,
            "open": sum(r["open"] for r in rows),
            "overdue": sum(r["overdue"] for r in rows),
            "approval_rate": round(100 * total["completed"] / decided, 1) if decided else None,
            "avg_hours": overall["avg_hours"],
            "p50_hours": overall["p50_hours"],
            "p90_hours": overall["p90_hours"],
        },
        "by_type": rows,
        "trend": trend,
        "bottlenecks": bottlenecks,
    }


def production_tab(conn: psycopg.Connection, p: dict) -> dict:
    lots = _rows(
        conn,
        """SELECT l.lot_no, l.status, l.quantity, l.uom, l.produced_on, l.note, i.name AS item,
                  coalesce(c.name, u.name) AS company,
                  (l.produced_on >= (now() AT TIME ZONE %(tz)s)::date - %(days)s + 1) AS in_period
           FROM mfg.lot l JOIN mdm.item i ON i.id = l.item_id JOIN core.org_unit u ON u.id = l.org_unit_id
           LEFT JOIN core.org_unit c ON c.id = core.company_of(l.org_unit_id)
           WHERE l.tenant_id = %(tenant)s
           ORDER BY l.produced_on DESC""",
        p,
    )
    by_company: dict[str, dict] = {}
    items: dict[tuple, dict] = {}
    for lot in lots:
        c = by_company.setdefault(lot["company"], {"company": lot["company"], "RELEASED": 0, "ON_HOLD": 0,
                                                   "SCRAPPED": 0})  # fmt: skip
        c[lot["status"]] += 1
        it = items.setdefault((lot["item"], lot["uom"]), {"item": lot["item"], "uom": lot["uom"], "released": 0.0,
                                                          "on_hold": 0.0, "lots": 0})  # fmt: skip
        it["lots"] += 1
        if lot["status"] == "RELEASED":
            it["released"] += lot["quantity"]
        elif lot["status"] == "ON_HOLD":
            it["on_hold"] += lot["quantity"]
    trend = _rows(
        conn,
        """WITH b AS (
               SELECT generate_series(date_trunc(%(bucket)s, (now() - make_interval(days => %(days)s - 1))
                                                            AT TIME ZONE %(tz)s),
                                      date_trunc(%(bucket)s, now() AT TIME ZONE %(tz)s),
                                      ('1 ' || %(bucket)s)::interval) AS at)
           SELECT to_char(b.at, 'YYYY-MM-DD') AS at, count(l.id)::int AS lots,
                  count(l.id) FILTER (WHERE l.status = 'ON_HOLD')::int AS on_hold
           FROM b LEFT JOIN mfg.lot l
             ON l.tenant_id = %(tenant)s AND date_trunc(%(bucket)s, l.produced_on::timestamp) = b.at
           GROUP BY b.at ORDER BY b.at""",
        p,
    )
    ic = _rows(
        conn,
        """SELECT o.status, o.total_amount, o.created_at, o.decided_at,
                  coalesce(bc.name, b.name) AS buyer, coalesce(sc.name, s.name) AS seller,
                  o.decided_at >= now() - make_interval(days => %(days)s) AS decided_in_period,
                  o.created_at >= now() - make_interval(days => %(days)s) AS created_in_period
           FROM ic.ic_order o
           JOIN core.org_unit b ON b.id = o.buyer_unit_id JOIN core.org_unit s ON s.id = o.seller_unit_id
           LEFT JOIN core.org_unit bc ON bc.id = core.company_of(o.buyer_unit_id)
           LEFT JOIN core.org_unit sc ON sc.id = core.company_of(o.seller_unit_id)
           WHERE o.tenant_id = %(tenant)s AND ic.can_read(o.id, %(person)s)""",
        p,
    )
    flows: dict[tuple, dict] = {}
    confirm_hours = []
    for o in ic:
        f = flows.setdefault((o["buyer"], o["seller"]), {"buyer": o["buyer"], "seller": o["seller"], "orders": 0,
                                                         "pending": 0, "confirmed_value": 0.0})  # fmt: skip
        if o["created_in_period"] or o["status"] == "PENDING":
            f["orders"] += 1
        if o["status"] == "PENDING":
            f["pending"] += 1
        if o["status"] == "CONFIRMED" and o["decided_in_period"]:
            f["confirmed_value"] += o["total_amount"]
            confirm_hours.append(
                (
                    dt.datetime.fromisoformat(o["decided_at"]) - dt.datetime.fromisoformat(o["created_at"])
                ).total_seconds()
                / 3600
            )
    po = _one(
        conn,
        """SELECT count(*)::int AS orders, coalesce(sum(total_amount), 0) AS value
           FROM proc.purchase_order
           WHERE tenant_id = %(tenant)s AND created_at >= now() - make_interval(days => %(days)s)
             AND wf.entity_can_read('proc.purchase_request', request_id, %(person)s)""",
        p,
    )
    in_period = [lot for lot in lots if lot["in_period"]]
    return {
        "totals": {
            "lots": len(in_period),
            "lots_on_hold": sum(1 for lot in lots if lot["status"] == "ON_HOLD"),
            "lots_scrapped": sum(1 for lot in in_period if lot["status"] == "SCRAPPED"),
            "ic_pending": sum(1 for o in ic if o["status"] == "PENDING"),
            "ic_confirmed_value": sum(f["confirmed_value"] for f in flows.values()),
            "ic_confirm_hours": round(sum(confirm_hours) / len(confirm_hours), 1) if confirm_hours else None,
            "po_orders": po["orders"],
            "po_value": po["value"],
        },
        "by_company": sorted(by_company.values(), key=lambda c: c["company"]),
        "trend": trend,
        "items": sorted(items.values(), key=lambda i: -i["lots"])[:8],
        "flows": sorted(flows.values(), key=lambda f: (-f["pending"], -f["orders"])),
        "held": [
            {k: lot[k] for k in ("lot_no", "item", "company", "quantity", "uom", "produced_on", "note")}
            for lot in lots
            if lot["status"] == "ON_HOLD"
        ][:10],
    }


def _tenant_admin(conn: psycopg.Connection, tenant, p: dict) -> dict:
    q = {**p, "t": tenant}
    units = _rows(
        conn,
        """WITH top AS (
               SELECT u.id, u.name, u.path FROM core.org_unit u
               WHERE u.tenant_id = %(t)s AND nlevel(u.path) = 2 AND u.valid_period @> now()),
           pos AS (
               SELECT p.id, p.org_unit_id, u.path,
                      EXISTS (SELECT 1 FROM core.assignment a
                              WHERE a.position_id = p.id AND a.valid_period @> now()) AS filled
               FROM core.position p JOIN core.org_unit u ON u.id = p.org_unit_id
               WHERE p.tenant_id = %(t)s AND p.valid_period @> now()),
           people AS (
               SELECT DISTINCT a.person_id, u.path FROM core.assignment a
               JOIN core.position p ON p.id = a.position_id JOIN core.org_unit u ON u.id = p.org_unit_id
               WHERE p.tenant_id = %(t)s AND a.valid_period @> now()),
           pr AS (
               SELECT r.status, r.total_amount, u.path,
                      EXISTS (SELECT 1 FROM wf.approval_history h
                              WHERE h.entity_type = 'proc.purchase_request' AND h.entity_id = r.id
                                AND h.event = 'COMPLETED'
                                AND h.created_at >= now() - make_interval(days => %(days)s)) AS approved_in_period,
                      EXISTS (SELECT 1 FROM wf.approval_history h
                              WHERE h.entity_type = 'proc.purchase_request' AND h.entity_id = r.id
                                AND h.event = 'SUBMITTED'
                                AND h.created_at >= now() - make_interval(days => %(days)s)) AS submitted_in_period
               FROM proc.purchase_request r JOIN core.org_unit u ON u.id = r.org_unit_id
               WHERE r.tenant_id = %(t)s),
           tasks AS (
               SELECT u.path, t.created_at FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
               JOIN core.org_unit u ON u.id = wf.entity_unit(s.entity_type, s.entity_id)
               WHERE t.tenant_id = %(t)s AND t.status = 'OPEN')
           SELECT top.name AS unit,
                  (SELECT count(DISTINCT person_id) FROM people WHERE people.path <@ top.path)::int AS headcount,
                  (SELECT count(*) FROM pos WHERE pos.path <@ top.path)::int AS positions,
                  (SELECT count(*) FROM pos WHERE pos.path <@ top.path AND NOT filled)::int AS vacant,
                  (SELECT count(*) FROM pr WHERE pr.path <@ top.path AND submitted_in_period)::int AS pr_submitted,
                  (SELECT coalesce(sum(total_amount), 0) FROM pr
                   WHERE pr.path <@ top.path AND approved_in_period) AS pr_approved_value,
                  (SELECT count(*) FROM pr WHERE pr.path <@ top.path AND status = 'PENDING')::int AS pr_pending,
                  (SELECT count(*) FROM tasks WHERE tasks.path <@ top.path)::int AS open_tasks,
                  (SELECT count(*) FROM tasks WHERE tasks.path <@ top.path
                     AND created_at < now() - make_interval(hours => %(sla)s))::int AS overdue_tasks
           FROM top ORDER BY top.name""",
        q,
    )
    head = _one(
        conn,
        """SELECT t.name AS tenant,
                  (SELECT count(DISTINCT a.person_id) FROM core.assignment a JOIN core.position p ON p.id = a.position_id
                   WHERE p.tenant_id = %(t)s AND a.valid_period @> now())::int AS headcount,
                  (SELECT count(*) FROM hr.onboarding_request r WHERE r.tenant_id = %(t)s
                     AND r.created_at >= now() - make_interval(days => %(days)s))::int AS onboarding_created,
                  (SELECT count(*) FROM wf.approval_history h WHERE h.tenant_id = %(t)s
                     AND h.entity_type = 'hr.onboarding_request' AND h.event = 'COMPLETED'
                     AND h.created_at >= now() - make_interval(days => %(days)s))::int AS onboarding_approved
           FROM core.tenant t WHERE t.id = %(t)s""",
        q,
    )
    monthly = _rows(
        conn,
        """WITH m AS (
               SELECT generate_series(date_trunc('month', now() AT TIME ZONE %(tz)s) - interval '5 months',
                                      date_trunc('month', now() AT TIME ZONE %(tz)s), interval '1 month') AS at)
           SELECT to_char(m.at, 'MM/YYYY') AS month, count(r.id)::int AS pr_approved,
                  coalesce(sum(r.total_amount), 0) AS pr_approved_value
           FROM m LEFT JOIN wf.approval_history h
             ON h.tenant_id = %(t)s AND h.entity_type = 'proc.purchase_request' AND h.event = 'COMPLETED'
            AND date_trunc('month', h.created_at AT TIME ZONE %(tz)s) = m.at
           LEFT JOIN proc.purchase_request r ON r.id = h.entity_id
           GROUP BY m.at ORDER BY m.at""",
        q,
    )
    keys = ("positions", "vacant", "pr_submitted", "pr_approved_value", "pr_pending", "open_tasks", "overdue_tasks")
    return {
        **head,
        **{k: sum(u[k] for u in units) for k in keys},
        "units": units,
        "monthly": monthly,
    }


def hospital_tab(conn: psycopg.Connection, p: dict) -> dict:
    if not _group_reader(conn, p["person"], p["tenant"]):
        return {"allowed": False, "tenants": []}
    children = [r[0] for r in conn.execute("SELECT core.child_tenants(%s)", (p["tenant"],)).fetchall()]
    return {
        "allowed": True,
        "scope": "children" if children else "self",
        "tenants": [_tenant_admin(conn, t, p) for t in (children or [p["tenant"]])],
    }


CHECKS = [
    (
        "person_unassigned",
        "Người không giữ vị trí nào",
        "warning",
        "/admin/people",
        """SELECT p.full_name AS name FROM core.person p WHERE p.tenant_id = %(tenant)s
           AND NOT EXISTS (SELECT 1 FROM core.assignment a WHERE a.person_id = p.id AND a.valid_period @> now())""",
    ),
    (
        "position_vacant",
        "Vị trí đang trống",
        "info",
        "/admin/org",
        """SELECT p.name || ' – ' || u.name AS name FROM core.position p JOIN core.org_unit u ON u.id = p.org_unit_id
           WHERE p.tenant_id = %(tenant)s AND p.valid_period @> now()
             AND NOT EXISTS (SELECT 1 FROM core.assignment a WHERE a.position_id = p.id AND a.valid_period @> now())""",
    ),
    (
        "unit_no_head",
        "Đơn vị chưa có vị trí trưởng",
        "warning",
        "/admin/org",
        """SELECT u.name FROM core.org_unit u WHERE u.tenant_id = %(tenant)s AND u.valid_period @> now()
           AND NOT EXISTS (SELECT 1 FROM core.position p WHERE p.org_unit_id = u.id AND p.is_head
                                                          AND p.valid_period @> now())""",
    ),
    (
        "item_no_category",
        "Vật tư chưa có nhóm hàng",
        "warning",
        "/admin/catalog",
        "SELECT name FROM mdm.item WHERE tenant_id = %(tenant)s AND is_active AND category_code IS NULL",
    ),
    (
        "partner_no_tax",
        "Nhà cung cấp thiếu mã số thuế",
        "warning",
        "/admin/catalog",
        """SELECT name FROM mdm.partner WHERE tenant_id = %(tenant)s AND is_active AND internal_unit_id IS NULL
           AND nullif(btrim(tax_code), '') IS NULL""",
    ),
    (
        "partner_proposed",
        "Nhà cung cấp đề xuất chưa vào danh mục",
        "info",
        "/admin/catalog",
        """SELECT DISTINCT proposed_partner_name AS name FROM proc.purchase_request WHERE tenant_id = %(tenant)s
           AND partner_id IS NULL AND proposed_partner_name IS NOT NULL AND status NOT IN ('CANCELLED', 'REJECTED')""",
    ),
    (
        "attachment_stuck",
        "Tệp kẹt ở bước kiểm dịch quá 1 giờ",
        "critical",
        "/h/drive",
        """SELECT file_name AS name FROM core.attachment WHERE tenant_id = %(tenant)s AND status = 'PENDING'
           AND deleted_at IS NULL AND created_at < now() - interval '1 hour'""",
    ),
    (
        "search_error",
        "Chứng từ / tệp lỗi khi đưa vào chỉ mục tìm kiếm",
        "critical",
        "/i/search",
        """SELECT entity_type || ' ' || entity_id AS name FROM search.pending
           WHERE tenant_id = %(tenant)s AND dirty AND attempts > 0""",
    ),
    (
        "company_no_location",
        "Công ty (pháp nhân) chưa có tọa độ trên bản đồ",
        "info",
        "/admin/org",
        """SELECT name FROM core.org_unit WHERE tenant_id = %(tenant)s AND is_legal_entity AND parent_id IS NOT NULL
           AND valid_period @> now() AND lat IS NULL""",
    ),
]


def quality_tab(conn: psycopg.Connection, p: dict) -> dict:
    admin = conn.execute(
        "SELECT EXISTS (SELECT 1 FROM core.v_admin WHERE tenant_id = %(tenant)s AND person_id = %(person)s)", p
    ).fetchone()[0]
    checks = []
    for key, label, severity, link, sql in CHECKS:
        names = [r[0] for r in conn.execute(f"SELECT name FROM ({sql}) x ORDER BY 1", p).fetchall()]
        checks.append(
            {
                "key": key,
                "label": label,
                "severity": severity,
                "link": link,
                "count": len(names),
                "samples": names[:5] if admin else [],
            }
        )
    passed = sum(1 for c in checks if c["count"] == 0)
    return {"admin": admin, "score": round(100 * passed / len(checks)), "checks": checks}


def sites_tab(conn: psycopg.Connection, p: dict) -> dict:
    sites = _rows(
        conn,
        f"""WITH {VISIBLE},
            tasks AS (
                SELECT u.path, t.created_at FROM wf.task t JOIN wf.approval_step s ON s.id = t.step_id
                JOIN vis ON vis.entity_type = s.entity_type AND vis.entity_id = s.entity_id
                JOIN core.org_unit u ON u.id = wf.entity_unit(s.entity_type, s.entity_id)
                WHERE t.tenant_id = %(tenant)s AND t.status = 'OPEN'),
            held AS (
                SELECT u.path, l.lot_no FROM mfg.lot l JOIN core.org_unit u ON u.id = l.org_unit_id
                WHERE l.tenant_id = %(tenant)s AND l.status = 'ON_HOLD')
            SELECT s.id, s.name, s.province, s.lat, s.lng, coalesce(c.name, s.name) AS company,
                   false AS subsidiary,
                   (SELECT count(*) FROM tasks WHERE tasks.path <@ s.path)::int AS open_tasks,
                   (SELECT count(*) FROM tasks WHERE tasks.path <@ s.path
                      AND created_at < now() - make_interval(hours => %(sla)s))::int AS overdue_tasks,
                   (SELECT array_agg(lot_no ORDER BY lot_no) FROM held WHERE held.path <@ s.path) AS held_lots
            FROM core.org_unit s LEFT JOIN core.org_unit c ON c.id = core.company_of(s.id)
            WHERE s.tenant_id = %(tenant)s AND s.lat IS NOT NULL AND s.valid_period @> now()
            ORDER BY s.name""",
        p,
    )
    if _group_reader(conn, p["person"], p["tenant"]):
        sites += _rows(
            conn,
            """SELECT s.id, s.name, s.province, s.lat, s.lng, t.name AS company, true AS subsidiary,
                      (SELECT count(*) FROM wf.task x JOIN wf.approval_step st ON st.id = x.step_id
                       JOIN core.org_unit u ON u.id = wf.entity_unit(st.entity_type, st.entity_id)
                       WHERE x.tenant_id = s.tenant_id AND x.status = 'OPEN' AND u.path <@ s.path)::int AS open_tasks,
                      (SELECT count(*) FROM wf.task x JOIN wf.approval_step st ON st.id = x.step_id
                       JOIN core.org_unit u ON u.id = wf.entity_unit(st.entity_type, st.entity_id)
                       WHERE x.tenant_id = s.tenant_id AND x.status = 'OPEN' AND u.path <@ s.path
                         AND x.created_at < now() - make_interval(hours => %(sla)s))::int AS overdue_tasks,
                      NULL::text[] AS held_lots
               FROM core.org_unit s JOIN core.tenant t ON t.id = s.tenant_id
               WHERE s.tenant_id IN (SELECT core.child_tenants(%(tenant)s)) AND s.lat IS NOT NULL
                 AND s.valid_period @> now()
               ORDER BY s.name""",
            p,
        )
    for s in sites:
        held = s.pop("held_lots") or []
        alerts = []
        if s["overdue_tasks"]:
            alerts.append(f"{s['overdue_tasks']} việc duyệt quá hạn {SLA_HOURS} giờ")
        if held:
            alerts.append(f"{len(held)} lô đang giữ: {', '.join(held[:3])}{'…' if len(held) > 3 else ''}")
        s.update(
            held_lots=len(held),
            alerts=alerts,
            status="critical" if s["overdue_tasks"] else "warning" if held or s["open_tasks"] else "ok",
        )
    return {"sites": sites}


HANDLERS_BY_TAB = {
    "process": process_tab,
    "production": production_tab,
    "hospital": hospital_tab,
    "quality": quality_tab,
    "sites": sites_tab,
}


def ops_dashboard(conn: psycopg.Connection, session: dict, args: dict, _ctx: Context) -> dict:
    tab = args["tab"]
    if tab not in TABS:
        raise ActionError(f"Bảng điều hành không hợp lệ: {tab}")
    days = int(args.get("days") or 30)
    if not 1 <= days <= 366:
        raise ActionError("Kỳ phải từ 1 đến 366 ngày")
    tenant, person = session.get("x-hasura-tenant-id"), session.get("x-hasura-user-id")
    if not tenant or not person:
        raise ActionError("Thiếu x-hasura-user-id hoặc x-hasura-tenant-id", "unauthorized", 401)
    params = {"tenant": tenant, "person": person, "days": days, "sla": SLA_HOURS, "tz": TZ, "bucket": _bucket(days)}
    return {"tab": tab, "days": days, "sla_hours": SLA_HOURS, "data": HANDLERS_BY_TAB[tab](conn, params)}


HANDLERS = {"ops_dashboard": ops_dashboard}
