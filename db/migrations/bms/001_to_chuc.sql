-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE core.tenant (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.tenant_relation (
    parent_tenant_id  uuid NOT NULL REFERENCES core.tenant,
    child_tenant_id   uuid NOT NULL UNIQUE REFERENCES core.tenant,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (parent_tenant_id, child_tenant_id),
    CHECK (parent_tenant_id <> child_tenant_id)
);
CREATE INDEX ON core.tenant_relation (child_tenant_id);

CREATE FUNCTION core.tenant_root(p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
    WITH RECURSIVE up(id, depth) AS (
        SELECT p_tenant, 0
        UNION ALL
        SELECT r.parent_tenant_id, up.depth + 1
        FROM up JOIN core.tenant_relation r ON r.child_tenant_id = up.id
        WHERE up.depth < 32
    )
    SELECT id FROM up ORDER BY depth DESC LIMIT 1
$$;

CREATE TABLE core.catalog_item (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog     text NOT NULL,
    code        text NOT NULL,
    name        text NOT NULL,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, catalog, code)
);

CREATE TABLE core.org_unit (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id        uuid,
    unit_type_id     uuid NOT NULL,
    code             text NOT NULL,
    name             text NOT NULL,
    is_legal_entity  boolean NOT NULL DEFAULT false,
    path             ltree NOT NULL,
    valid_period     tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, parent_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, unit_type_id) REFERENCES core.catalog_item (tenant_id, id),
    CHECK (parent_id IS DISTINCT FROM id),
    CHECK (NOT isempty(valid_period))
);
CREATE INDEX ON core.org_unit USING gist (path);
CREATE INDEX ON core.org_unit (tenant_id, parent_id);
CREATE INDEX ON core.org_unit (tenant_id, unit_type_id);

CREATE FUNCTION core.org_unit_label(p_id uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'u' || replace(p_id::text, '-', '') $$;

CREATE FUNCTION core.org_unit_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_parent_path ltree;
    v_catalog     text;
BEGIN
    SELECT catalog INTO v_catalog FROM core.catalog_item
    WHERE tenant_id = NEW.tenant_id AND id = NEW.unit_type_id;
    IF v_catalog IS DISTINCT FROM 'UNIT_TYPE' THEN
        RAISE EXCEPTION 'unit_type_id phải là mục thuộc danh mục UNIT_TYPE';
    END IF;

    IF NEW.parent_id IS NULL THEN
        NEW.path := text2ltree(core.org_unit_label(NEW.id));
    ELSE
        SELECT path INTO v_parent_path FROM core.org_unit
        WHERE tenant_id = NEW.tenant_id AND id = NEW.parent_id;
        IF v_parent_path ~ ('*.' || core.org_unit_label(NEW.id) || '.*')::lquery THEN
            RAISE EXCEPTION 'Không thể đặt đơn vị % làm con của chính cây con của nó', NEW.code;
        END IF;
        NEW.path := v_parent_path || text2ltree(core.org_unit_label(NEW.id));
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER org_unit_before_insert BEFORE INSERT ON core.org_unit
FOR EACH ROW EXECUTE FUNCTION core.org_unit_before_write();
CREATE TRIGGER org_unit_before_update BEFORE UPDATE OF parent_id, unit_type_id ON core.org_unit
FOR EACH ROW EXECUTE FUNCTION core.org_unit_before_write();

CREATE FUNCTION core.org_unit_after_move() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE core.org_unit
    SET path = NEW.path || subpath(path, nlevel(OLD.path))
    WHERE tenant_id = NEW.tenant_id AND path <@ OLD.path AND id <> NEW.id;
    RETURN NULL;
END $$;

CREATE TRIGGER org_unit_after_move AFTER UPDATE OF parent_id ON core.org_unit
FOR EACH ROW WHEN (OLD.path IS DISTINCT FROM NEW.path)
EXECUTE FUNCTION core.org_unit_after_move();

CREATE FUNCTION core.company_of(p_unit uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT c.id
    FROM core.org_unit u
    JOIN core.org_unit c ON c.tenant_id = u.tenant_id AND c.path @> u.path AND c.is_legal_entity
    WHERE u.id = p_unit
    ORDER BY nlevel(c.path) DESC
    LIMIT 1
$$;

CREATE TABLE core.position (
    tenant_id      uuid NOT NULL REFERENCES core.tenant,
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_unit_id    uuid NOT NULL,
    job_title_id   uuid,
    name           text NOT NULL,
    is_head        boolean NOT NULL DEFAULT false,
    reports_to_id  uuid,
    valid_period   tstzrange NOT NULL DEFAULT tstzrange(now(), NULL),
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, job_title_id) REFERENCES core.catalog_item (tenant_id, id),
    FOREIGN KEY (tenant_id, reports_to_id) REFERENCES core.position (tenant_id, id),
    CHECK (reports_to_id IS DISTINCT FROM id),
    CHECK (NOT isempty(valid_period)),
    CONSTRAINT position_one_head_per_unit
        EXCLUDE USING gist (tenant_id WITH =, org_unit_id WITH =, valid_period WITH &&)
        WHERE (is_head)
);
CREATE INDEX ON core.position (tenant_id, org_unit_id);
CREATE INDEX ON core.position (tenant_id, job_title_id);
CREATE INDEX ON core.position (tenant_id, reports_to_id);

CREATE TABLE core.person (
    tenant_id      uuid NOT NULL REFERENCES core.tenant,
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idp_subject    text,
    full_name      text NOT NULL,
    employee_code  text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idp_subject),
    UNIQUE (tenant_id, employee_code)
);
CREATE INDEX ON core.person (idp_subject);

CREATE FUNCTION core.person_check_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.idp_subject IS NOT NULL AND EXISTS (
        SELECT 1 FROM core.person p
        WHERE p.idp_subject = NEW.idp_subject
          AND p.tenant_id <> NEW.tenant_id
          AND core.tenant_root(p.tenant_id) <> core.tenant_root(NEW.tenant_id)
    ) THEN
        RAISE EXCEPTION 'Tài khoản % đã dùng ở một tenant không cùng công ty mẹ (ADR #30)', NEW.idp_subject;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER person_check_account BEFORE INSERT OR UPDATE OF idp_subject, tenant_id ON core.person
FOR EACH ROW EXECUTE FUNCTION core.person_check_account();

CREATE FUNCTION core.account_tenants(p_subject text)
RETURNS TABLE (tenant_id uuid, tenant_code text, person_id uuid)
LANGUAGE sql STABLE AS $$
    SELECT p.tenant_id, t.code, p.id
    FROM core.person p JOIN core.tenant t ON t.id = p.tenant_id
    WHERE p.idp_subject = p_subject
    ORDER BY t.code
$$;

CREATE TABLE core.assignment (
    tenant_id         uuid NOT NULL REFERENCES core.tenant,
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id         uuid NOT NULL,
    position_id       uuid NOT NULL,
    assignment_type   text NOT NULL CHECK (assignment_type IN ('PRIMARY', 'CONCURRENT', 'ACTING', 'CONTRACT')),
    valid_period      tstzrange NOT NULL,
    contract_no       text,
    contract_partner  text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, position_id) REFERENCES core.position (tenant_id, id),
    CHECK (NOT isempty(valid_period)),
    CONSTRAINT assignment_contract_fields CHECK (
        assignment_type <> 'CONTRACT' OR (contract_no IS NOT NULL AND NOT upper_inf(valid_period))
    ),
    CONSTRAINT assignment_one_primary_per_person
        EXCLUDE USING gist (tenant_id WITH =, person_id WITH =, valid_period WITH &&)
        WHERE (assignment_type = 'PRIMARY'),
    CONSTRAINT assignment_one_occupant_per_position
        EXCLUDE USING gist (tenant_id WITH =, position_id WITH =, valid_period WITH &&)
);
CREATE INDEX ON core.assignment (tenant_id, person_id);
CREATE INDEX ON core.assignment (tenant_id, position_id);

CREATE FUNCTION core.assignment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_pos core.position;
BEGIN
    SELECT * INTO v_pos FROM core.position WHERE tenant_id = NEW.tenant_id AND id = NEW.position_id;

    IF NEW.assignment_type = 'CONTRACT' THEN
        IF v_pos.is_head THEN
            RAISE EXCEPTION 'Bổ nhiệm hợp đồng không được giữ vị trí trưởng (ADR #29)';
        END IF;
        IF v_pos.reports_to_id IS NULL THEN
            RAISE EXCEPTION 'Vị trí theo hợp đồng phải báo cáo cho người quản lý hợp đồng (ADR #29)';
        END IF;
    END IF;

    IF NEW.assignment_type IN ('CONTRACT', 'PRIMARY') AND EXISTS (
        SELECT 1
        FROM core.assignment o
        JOIN core.position op ON op.tenant_id = o.tenant_id AND op.id = o.position_id
        WHERE o.tenant_id = NEW.tenant_id
          AND o.person_id = NEW.person_id
          AND o.id <> NEW.id
          AND o.valid_period && NEW.valid_period
          AND o.assignment_type IN ('CONTRACT', 'PRIMARY')
          AND o.assignment_type <> NEW.assignment_type
          AND core.company_of(op.org_unit_id) = core.company_of(v_pos.org_unit_id)
    ) THEN
        RAISE EXCEPTION 'Bổ nhiệm hợp đồng phải ở công ty khác công ty giữ chính (ADR #29)';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER assignment_check BEFORE INSERT OR UPDATE ON core.assignment
FOR EACH ROW EXECUTE FUNCTION core.assignment_check();

CREATE FUNCTION core.position_holder(p_position uuid, p_at timestamptz DEFAULT now())
RETURNS TABLE (person_id uuid, assignment_type text)
LANGUAGE sql STABLE AS $$
    SELECT a.person_id, a.assignment_type
    FROM core.assignment a
    WHERE a.position_id = p_position AND a.valid_period @> p_at
$$;

CREATE FUNCTION core.manager_position(p_position uuid, p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_pos       core.position;
    v_unit_path ltree;
    v_result    uuid;
BEGIN
    SELECT * INTO v_pos FROM core.position WHERE id = p_position;
    IF v_pos.reports_to_id IS NOT NULL THEN
        SELECT id INTO v_result FROM core.position
        WHERE id = v_pos.reports_to_id AND valid_period @> p_at;
        IF v_result IS NOT NULL THEN
            RETURN v_result;
        END IF;
    END IF;

    SELECT path INTO v_unit_path FROM core.org_unit WHERE id = v_pos.org_unit_id;
    IF v_pos.is_head THEN
        IF nlevel(v_unit_path) = 1 THEN
            RETURN NULL;
        END IF;
        v_unit_path := subpath(v_unit_path, 0, nlevel(v_unit_path) - 1);
    END IF;

    SELECT p.id INTO v_result
    FROM core.org_unit u
    JOIN core.position p ON p.tenant_id = u.tenant_id AND p.org_unit_id = u.id
    WHERE u.tenant_id = v_pos.tenant_id
      AND u.path @> v_unit_path
      AND p.is_head AND p.valid_period @> p_at
      AND p.id <> p_position
    ORDER BY nlevel(u.path) DESC
    LIMIT 1;
    RETURN v_result;
END $$;
