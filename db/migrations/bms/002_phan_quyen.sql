-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 002: Vai trò, quyền, nhóm, ủy quyền; quyền hiệu lực của từng người.
-- Quyền gắn với vị trí (ADR #5); gán thẳng cho người chỉ là ngoại lệ có thời hạn.

CREATE TABLE core.permission (
    code         text PRIMARY KEY,
    description  text NOT NULL
);

INSERT INTO core.permission (code, description) VALUES
    ('wf.approval.act',            'Duyệt, từ chối, trả về việc duyệt'),
    ('proc.purchase_request.read', 'Xem đề nghị mua sắm'),
    ('proc.purchase_request.create', 'Lập đề nghị mua sắm'),
    ('core.org.manage',            'Quản trị cơ cấu tổ chức'),
    ('core.permission.manage',     'Quản trị phân quyền');

CREATE TABLE core.role (
    tenant_id  uuid NOT NULL REFERENCES core.tenant,
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL,
    name       text NOT NULL,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code)
);

CREATE TABLE core.role_permission (
    tenant_id        uuid NOT NULL,
    role_id          uuid NOT NULL,
    permission_code  text NOT NULL REFERENCES core.permission,
    PRIMARY KEY (role_id, permission_code),
    FOREIGN KEY (tenant_id, role_id) REFERENCES core.role (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX ON core.role_permission (tenant_id, role_id);
CREATE INDEX ON core.role_permission (permission_code);

CREATE TABLE core.team (
    tenant_id  uuid NOT NULL REFERENCES core.tenant,
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    UNIQUE (tenant_id, id)
);

CREATE TABLE core.team_member (
    tenant_id     uuid NOT NULL,
    team_id       uuid NOT NULL,
    person_id     uuid NOT NULL,
    valid_period  tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
    PRIMARY KEY (team_id, person_id, valid_period),
    FOREIGN KEY (tenant_id, team_id) REFERENCES core.team (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON core.team_member (tenant_id, team_id);
CREATE INDEX ON core.team_member (tenant_id, person_id);

-- Gán vai trò cho đúng một đối tượng: vị trí, đơn vị, nhóm, hoặc (ngoại lệ) người.
-- Phạm vi neo tại scope_unit_id; nếu bỏ trống thì neo tại đơn vị của vị trí/đơn vị được gán.
CREATE TABLE core.role_grant (
    tenant_id      uuid NOT NULL REFERENCES core.tenant,
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id        uuid NOT NULL,
    person_id      uuid,
    position_id    uuid,
    org_unit_id    uuid,
    team_id        uuid,
    scope          text NOT NULL CHECK (scope IN ('TENANT', 'SUBTREE', 'UNIT', 'SELF')),
    scope_unit_id  uuid,
    valid_period   tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES core.role (tenant_id, id),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, team_id) REFERENCES core.team (tenant_id, id),
    FOREIGN KEY (tenant_id, scope_unit_id) REFERENCES core.org_unit (tenant_id, id),
    CHECK (num_nonnulls(person_id, position_id, org_unit_id, team_id) = 1),
    CHECK (NOT isempty(valid_period)),
    CONSTRAINT role_grant_person_has_end CHECK (person_id IS NULL OR NOT upper_inf(valid_period)),
    CONSTRAINT role_grant_anchor CHECK (
        scope IN ('TENANT', 'SELF') OR position_id IS NOT NULL OR org_unit_id IS NOT NULL OR scope_unit_id IS NOT NULL
    )
);
CREATE INDEX ON core.role_grant (tenant_id, role_id);
CREATE INDEX ON core.role_grant (tenant_id, person_id);
CREATE INDEX ON core.role_grant (tenant_id, position_id);
CREATE INDEX ON core.role_grant (tenant_id, org_unit_id);
CREATE INDEX ON core.role_grant (tenant_id, team_id);
CREATE INDEX ON core.role_grant (tenant_id, scope_unit_id);

-- Gán thẳng cho người chỉ dành cho người không nằm trong cây tổ chức (ghi chú ADR #5).
CREATE FUNCTION core.role_grant_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.person_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM core.assignment a
        WHERE a.tenant_id = NEW.tenant_id AND a.person_id = NEW.person_id
          AND a.valid_period && NEW.valid_period
    ) THEN
        RAISE EXCEPTION 'Người đang có bổ nhiệm trong cây tổ chức: gán vai trò cho vị trí thay vì cho người (ADR #5)';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER role_grant_check BEFORE INSERT OR UPDATE ON core.role_grant
FOR EACH ROW EXECUTE FUNCTION core.role_grant_check();

-- ---------------------------------------------------------------------------
-- Ủy quyền: người giữ vị trí tạm giao một phần quyền của vị trí khi vắng mặt
-- ---------------------------------------------------------------------------

CREATE TABLE core.delegation (
    tenant_id         uuid NOT NULL REFERENCES core.tenant,
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id      uuid NOT NULL,
    delegate_id       uuid NOT NULL,
    position_id       uuid NOT NULL,
    permission_codes  text[],            -- NULL: toàn bộ quyền của vị trí
    valid_period      tstzrange NOT NULL,
    reason            text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, delegator_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, delegate_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, position_id) REFERENCES core.position (tenant_id, id),
    CHECK (delegator_id <> delegate_id),
    CHECK (NOT isempty(valid_period) AND NOT upper_inf(valid_period))
);
CREATE INDEX ON core.delegation (tenant_id, delegator_id);
CREATE INDEX ON core.delegation (tenant_id, delegate_id);
CREATE INDEX ON core.delegation (tenant_id, position_id);

CREATE FUNCTION core.delegation_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_company uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM core.assignment a
        WHERE a.tenant_id = NEW.tenant_id AND a.person_id = NEW.delegator_id
          AND a.position_id = NEW.position_id AND a.valid_period @> NEW.valid_period
          AND a.assignment_type <> 'CONTRACT'
    ) THEN
        RAISE EXCEPTION 'Người ủy quyền phải giữ vị trí trong suốt thời gian ủy quyền';
    END IF;

    -- Người làm hợp đồng không được duyệt (ADR #29): người nhận ủy quyền phải có
    -- bổ nhiệm không phải hợp đồng ở cùng công ty với vị trí được ủy quyền.
    SELECT core.company_of(p.org_unit_id) INTO v_company FROM core.position p WHERE p.id = NEW.position_id;
    IF NOT EXISTS (
        SELECT 1 FROM core.assignment a
        JOIN core.position p ON p.tenant_id = a.tenant_id AND p.id = a.position_id
        WHERE a.tenant_id = NEW.tenant_id AND a.person_id = NEW.delegate_id
          AND a.valid_period && NEW.valid_period
          AND a.assignment_type <> 'CONTRACT'
          AND core.company_of(p.org_unit_id) IS NOT DISTINCT FROM v_company
    ) THEN
        RAISE EXCEPTION 'Người nhận ủy quyền phải là người của cùng công ty, không theo hợp đồng';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER delegation_check BEFORE INSERT OR UPDATE ON core.delegation
FOR EACH ROW EXECUTE FUNCTION core.delegation_check();

-- ---------------------------------------------------------------------------
-- Quyền hiệu lực: mỗi dòng là một quyền của một người kèm phạm vi và thời hạn
-- ---------------------------------------------------------------------------

CREATE VIEW core.v_permission_grant AS
WITH position_grant AS (
    -- Vai trò gán cho vị trí, hoặc cho đơn vị chứa vị trí.
    SELECT p.tenant_id, p.id AS position_id, g.role_id, g.scope,
           coalesce(g.scope_unit_id, g.org_unit_id, p.org_unit_id) AS anchor_unit_id,
           g.valid_period * p.valid_period AS valid_period
    FROM core.position p
    JOIN core.role_grant g ON g.tenant_id = p.tenant_id
                          AND (g.position_id = p.id OR g.org_unit_id = p.org_unit_id)
    WHERE g.valid_period && p.valid_period
),
person_grant AS (
    SELECT a.tenant_id, a.person_id, pg.role_id, pg.scope, pg.anchor_unit_id,
           pg.valid_period * a.valid_period AS valid_period,
           'ASSIGNMENT'::text AS source, a.position_id, NULL::text[] AS permission_filter
    FROM core.assignment a
    JOIN position_grant pg ON pg.tenant_id = a.tenant_id AND pg.position_id = a.position_id
    WHERE pg.valid_period && a.valid_period
    UNION ALL
    SELECT d.tenant_id, d.delegate_id, pg.role_id, pg.scope, pg.anchor_unit_id,
           pg.valid_period * d.valid_period,
           'DELEGATION', d.position_id, d.permission_codes
    FROM core.delegation d
    JOIN position_grant pg ON pg.tenant_id = d.tenant_id AND pg.position_id = d.position_id
    WHERE pg.valid_period && d.valid_period
    UNION ALL
    SELECT m.tenant_id, m.person_id, g.role_id, g.scope, g.scope_unit_id,
           g.valid_period * m.valid_period,
           'TEAM', NULL, NULL
    FROM core.team_member m
    JOIN core.role_grant g ON g.tenant_id = m.tenant_id AND g.team_id = m.team_id
    WHERE g.valid_period && m.valid_period
    UNION ALL
    SELECT g.tenant_id, g.person_id, g.role_id, g.scope, g.scope_unit_id,
           g.valid_period,
           'PERSON', NULL, NULL
    FROM core.role_grant g
    WHERE g.person_id IS NOT NULL
)
SELECT pg.tenant_id, pg.person_id, rp.permission_code, pg.scope, pg.anchor_unit_id,
       pg.valid_period, pg.source, pg.position_id
FROM person_grant pg
JOIN core.role_permission rp ON rp.tenant_id = pg.tenant_id AND rp.role_id = pg.role_id
WHERE pg.permission_filter IS NULL OR rp.permission_code = ANY (pg.permission_filter);

-- Người có quyền trên đơn vị tại thời điểm p_at không. Phạm vi SELF kiểm tra ở tầng nghiệp vụ.
CREATE FUNCTION core.has_permission(p_person uuid, p_permission text, p_unit uuid,
                                    p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM core.v_permission_grant g
        JOIN core.org_unit target ON target.id = p_unit AND target.tenant_id = g.tenant_id
        LEFT JOIN core.org_unit anchor ON anchor.id = g.anchor_unit_id
        WHERE g.person_id = p_person
          AND g.permission_code = p_permission
          AND g.valid_period @> p_at
          AND (g.scope = 'TENANT'
               OR (g.scope = 'SUBTREE' AND target.path <@ anchor.path)
               OR (g.scope = 'UNIT' AND target.id = anchor.id))
    )
$$;
