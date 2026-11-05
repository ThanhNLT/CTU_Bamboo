-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 054: Không gian P (ADR #66): quản lý dự án và kế hoạch: văn bản kế hoạch chi tiết, cấu trúc phân rã công việc (WBS),
-- phụ thuộc kết thúc→bắt đầu, đường cơ sở, báo cáo tiến độ theo kỳ, sơ đồ Gantt. Schema `pm` thuộc mô-đun `project`.

CREATE SCHEMA pm;

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY', 'EXTERNAL',
                        'CHAT_MESSAGE', 'CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_CHANGED',
                        'PROJECT_TASK', 'PROJECT_REPORT'));

INSERT INTO core.permission (code, description) VALUES
    ('pm.project.read', 'Xem mọi dự án của đơn vị (và đơn vị con), kể cả khi không là thành viên'),
    ('pm.project.manage', 'Quản lý mọi dự án của đơn vị (và đơn vị con): sửa kế hoạch, thành viên, công việc');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT DISTINCT tenant_id, role_id, p
FROM core.role_permission, unnest(ARRAY['pm.project.read', 'pm.project.manage']) p
WHERE permission_code = 'core.org.manage';

-- Dự án: thông tin chung và văn bản kế hoạch chi tiết (mục tiêu, phạm vi, sản phẩm bàn giao, cách triển khai, rủi ro,
-- các bên liên quan). Mỗi dự án có một nhóm nhắn tin riêng (ADR #65) đồng bộ theo thành viên.
CREATE TABLE pm.project (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
    name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    org_unit_id      uuid NOT NULL,
    manager_id       uuid NOT NULL,
    status           text NOT NULL DEFAULT 'PLANNING'
                     CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'DONE', 'CANCELLED')),
    start_date       date NOT NULL,
    end_date         date NOT NULL,
    budget           numeric(18, 0) CHECK (budget IS NULL OR budget >= 0),
    objective        text CHECK (length(objective) <= 8000),
    scope            text CHECK (length(scope) <= 8000),
    deliverables     text CHECK (length(deliverables) <= 8000),
    approach         text CHECK (length(approach) <= 8000),
    risks            text CHECK (length(risks) <= 8000),
    stakeholders     text CHECK (length(stakeholders) <= 8000),
    conversation_id  uuid REFERENCES chat.conversation ON DELETE SET NULL,
    baseline_at      timestamptz,
    created_by       uuid NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, manager_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id),
    CHECK (end_date >= start_date AND end_date <= start_date + 3660)
);
CREATE INDEX project_unit ON pm.project (tenant_id, org_unit_id);
CALL audit.enable('pm.project');

CREATE TABLE pm.member (
    tenant_id   uuid NOT NULL,
    project_id  uuid NOT NULL,
    person_id   uuid NOT NULL,
    role        text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MANAGER', 'MEMBER', 'VIEWER')),
    added_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, person_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES pm.project (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX member_person ON pm.member (tenant_id, person_id);
CALL audit.enable('pm.member', 'project_id', 'person_id');

-- Công việc (WBS): cây theo parent_id, thứ tự anh em theo seq. Ngày lưu cho mọi công việc; công việc có con là công việc
-- tổng hợp, ngày và % hoàn thành tính từ con (actions/app/projects.py). Đường cơ sở: ngày đã chốt để so lệch kế hoạch.
CREATE TABLE pm.task (
    tenant_id       uuid NOT NULL,
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL,
    parent_id       uuid,
    seq             int NOT NULL DEFAULT 0,
    name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 300),
    description     text CHECK (length(description) <= 4000),
    start_date      date NOT NULL,
    end_date        date NOT NULL,
    milestone       boolean NOT NULL DEFAULT false,
    progress        smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    assignee_id     uuid,
    baseline_start  date,
    baseline_end    date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (project_id, id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES pm.project (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, parent_id) REFERENCES pm.task (project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, assignee_id) REFERENCES core.person (tenant_id, id),
    CHECK (end_date >= start_date),
    CHECK (NOT milestone OR end_date = start_date),
    CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX task_project ON pm.task (project_id, parent_id, seq);
CREATE INDEX task_assignee ON pm.task (tenant_id, assignee_id, end_date);
CALL audit.enable('pm.task');

-- Phụ thuộc kết thúc→bắt đầu (FS): công việc sau bắt đầu sớm nhất một ngày sau khi công việc trước kết thúc, cộng độ trễ
CREATE TABLE pm.dependency (
    tenant_id       uuid NOT NULL,
    project_id      uuid NOT NULL,
    predecessor_id  uuid NOT NULL,
    successor_id    uuid NOT NULL,
    lag_days        int NOT NULL DEFAULT 0 CHECK (lag_days BETWEEN -365 AND 365),
    PRIMARY KEY (predecessor_id, successor_id),
    FOREIGN KEY (tenant_id, project_id) REFERENCES pm.project (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, predecessor_id) REFERENCES pm.task (project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, successor_id) REFERENCES pm.task (project_id, id) ON DELETE CASCADE,
    CHECK (predecessor_id <> successor_id)
);
CREATE INDEX dependency_successor ON pm.dependency (successor_id);

CREATE FUNCTION pm.dependency_no_cycle() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE reach(id) AS (
            SELECT NEW.successor_id
            UNION
            SELECT d.successor_id FROM pm.dependency d JOIN reach r ON d.predecessor_id = r.id
        )
        SELECT FROM reach WHERE id = NEW.predecessor_id
    ) THEN
        RAISE EXCEPTION 'Phụ thuộc tạo vòng lặp giữa các công việc' USING ERRCODE = 'data_exception';
    END IF;
    -- Công việc tổng hợp và công việc con của nó không phụ thuộc nhau (ngày của cha suy từ con)
    IF EXISTS (
        WITH RECURSIVE up(id) AS (
            SELECT parent_id FROM pm.task WHERE id = NEW.successor_id
            UNION SELECT t.parent_id FROM pm.task t JOIN up ON t.id = up.id WHERE t.parent_id IS NOT NULL
        ) SELECT FROM up WHERE id = NEW.predecessor_id
    ) OR EXISTS (
        WITH RECURSIVE up(id) AS (
            SELECT parent_id FROM pm.task WHERE id = NEW.predecessor_id
            UNION SELECT t.parent_id FROM pm.task t JOIN up ON t.id = up.id WHERE t.parent_id IS NOT NULL
        ) SELECT FROM up WHERE id = NEW.successor_id
    ) THEN
        RAISE EXCEPTION 'Không đặt phụ thuộc giữa công việc tổng hợp và công việc con của nó'
            USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER dependency_no_cycle BEFORE INSERT OR UPDATE ON pm.dependency
    FOR EACH ROW EXECUTE FUNCTION pm.dependency_no_cycle();

-- Cây công việc không được có vòng (đổi cha thành con cháu của chính nó)
CREATE FUNCTION pm.task_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.parent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) AND EXISTS (
        WITH RECURSIVE up(id) AS (
            SELECT NEW.parent_id
            UNION SELECT t.parent_id FROM pm.task t JOIN up ON t.id = up.id WHERE t.parent_id IS NOT NULL
        ) SELECT FROM up WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Không đặt công việc làm con của chính nó' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER task_before_write BEFORE INSERT OR UPDATE ON pm.task FOR EACH ROW EXECUTE FUNCTION pm.task_before_write();

-- Báo cáo tiến độ theo kỳ: chụp số liệu lúc lập (kế hoạch %, thực hiện %, SPI, việc trễ), không sửa sau khi lập
CREATE TABLE pm.report (
    tenant_id        uuid NOT NULL,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL,
    period_from      date NOT NULL,
    period_to        date NOT NULL,
    health           text NOT NULL CHECK (health IN ('GREEN', 'AMBER', 'RED')),
    summary          text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 8000),
    accomplishments  text CHECK (length(accomplishments) <= 8000),
    next_steps       text CHECK (length(next_steps) <= 8000),
    issues           text CHECK (length(issues) <= 8000),
    planned_pct      numeric(5, 2) NOT NULL,
    actual_pct       numeric(5, 2) NOT NULL,
    spi              numeric(6, 3),
    late_tasks       int NOT NULL DEFAULT 0,
    snapshot         jsonb NOT NULL DEFAULT '[]',
    created_by       uuid NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, project_id) REFERENCES pm.project (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id),
    CHECK (period_to >= period_from)
);
CREATE INDEX report_project ON pm.report (project_id, period_to DESC);
CALL audit.enable('pm.report');

CREATE FUNCTION pm.report_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Báo cáo tiến độ đã lập không sửa được; lập báo cáo mới cho kỳ sau';
END $$;
CREATE TRIGGER report_immutable BEFORE UPDATE ON pm.report FOR EACH ROW EXECUTE FUNCTION pm.report_immutable();

-- Quyền: thành viên (mọi vai trò) xem; người quản lý dự án sửa. Người có pm.project.read / pm.project.manage trên đơn vị
-- chủ trì (hoặc đơn vị cấp trên) xem / quản lý mọi dự án của đơn vị.
CREATE FUNCTION pm.can_read(p_project uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT FROM pm.project j
        WHERE j.id = p_project AND (
            j.manager_id = p_person
            OR EXISTS (SELECT FROM pm.member m WHERE m.project_id = j.id AND m.person_id = p_person)
            OR core.has_permission(p_person, 'pm.project.read', j.org_unit_id)
            OR core.has_permission(p_person, 'pm.project.manage', j.org_unit_id)))
$$;

CREATE FUNCTION pm.can_manage(p_project uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT FROM pm.project j
        WHERE j.id = p_project AND (
            j.manager_id = p_person
            OR EXISTS (SELECT FROM pm.member m WHERE m.project_id = j.id AND m.person_id = p_person AND m.role = 'MANAGER')
            OR core.has_permission(p_person, 'pm.project.manage', j.org_unit_id)))
$$;

CREATE FUNCTION pm.project_can_read(p_row pm.project, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT pm.can_read(p_row.id, core.session_person(hasura_session)) $$;

CREATE FUNCTION pm.project_can_manage(p_row pm.project, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT pm.can_manage(p_row.id, core.session_person(hasura_session)) $$;

-- Số liệu tiến độ của dự án tại một ngày, tính trên công việc lá (không có con), trọng số = số ngày của công việc
-- (mốc: trọng số 0, chỉ tính khi cả dự án toàn mốc):
--   thực hiện % = Σ(trọng số × % hoàn thành) / Σ trọng số
--   kế hoạch % = Σ(trọng số × phần thời gian đã trôi qua của công việc) / Σ trọng số
--   SPI = thực hiện / kế hoạch (chỉ số tiến độ; < 1 là chậm)
--   việc trễ = công việc lá chưa xong mà ngày kết thúc đã qua
CREATE FUNCTION pm.stats(p_project uuid, p_at date DEFAULT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
RETURNS TABLE (actual_pct numeric, planned_pct numeric, spi numeric, late_tasks int, total_tasks int, done_tasks int)
LANGUAGE sql STABLE AS $$
    WITH leaf AS (
        SELECT t.*, CASE WHEN t.milestone THEN 0 ELSE t.end_date - t.start_date + 1 END AS w
        FROM pm.task t
        WHERE t.project_id = p_project AND NOT EXISTS (SELECT FROM pm.task c WHERE c.parent_id = t.id)
    ), agg AS (
        SELECT
            sum(w) AS wsum,
            sum(w * progress)::numeric AS wdone,
            sum(w * least(1, greatest(0, (p_at - start_date + 1)::numeric / nullif(w, 0)))) AS wplan,
            avg(progress) AS avg_done,
            avg(CASE WHEN end_date <= p_at THEN 100 ELSE 0 END) AS avg_plan,
            count(*) FILTER (WHERE progress < 100 AND end_date < p_at) AS late,
            count(*) AS total,
            count(*) FILTER (WHERE progress = 100) AS done
        FROM leaf
    )
    SELECT round(a.actual, 2), round(a.planned, 2),
           CASE WHEN a.planned > 0 THEN round(a.actual / a.planned, 3) END,
           a.late::int, a.total::int, a.done::int
    FROM (
        SELECT CASE WHEN coalesce(wsum, 0) > 0 THEN wdone / wsum ELSE coalesce(avg_done, 0) END AS actual,
               CASE WHEN coalesce(wsum, 0) > 0 THEN wplan * 100 / wsum ELSE coalesce(avg_plan, 0) END AS planned,
               late, total, done
        FROM agg
    ) a
$$;

CREATE FUNCTION pm.project_progress(p_row pm.project) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT actual_pct FROM pm.stats(p_row.id) $$;

CREATE FUNCTION pm.project_planned(p_row pm.project) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT planned_pct FROM pm.stats(p_row.id) $$;

CREATE FUNCTION pm.project_late_tasks(p_row pm.project) RETURNS integer
LANGUAGE sql STABLE AS $$ SELECT late_tasks FROM pm.stats(p_row.id) $$;

-- Thay đổi dự án báo cho trình duyệt đang mở (ADR #64)
CALL live.track('pm.project', 'project');
CALL live.track('pm.task', 'project');
CALL live.track('pm.dependency', 'project');
CALL live.track('pm.member', 'project');
CALL live.track('pm.report', 'project');

-- Hệ thống đang chạy: mô-đun quản lý dự án coi như đã cài và bật cho các công ty hiện có (như migration 042)
INSERT INTO core.module_install (module, installed_by)
SELECT 'project', 'migration 054' WHERE EXISTS (SELECT FROM core.tenant)
ON CONFLICT DO NOTHING;
INSERT INTO core.tenant_module (tenant_id, module)
SELECT t.id, 'project' FROM core.tenant t WHERE EXISTS (SELECT FROM core.module_install WHERE module = 'project')
ON CONFLICT DO NOTHING;
