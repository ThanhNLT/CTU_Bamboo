-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

INSERT INTO core.permission (code, description) VALUES
    ('hr.decision.issue', 'Ban hành quyết định nhân sự (bổ nhiệm, điều chuyển, miễn nhiệm) trong toàn tenant'),
    ('hr.decision.read', 'Xem mọi quyết định nhân sự của tenant');

CREATE TABLE hr.personnel_decision (
    tenant_id             uuid NOT NULL REFERENCES core.tenant,
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no                text NOT NULL,
    decision_type         text NOT NULL CHECK (decision_type IN ('APPOINT', 'TRANSFER', 'DISMISS')),
    assignment_type       text NOT NULL CHECK (assignment_type IN ('PRIMARY', 'CONCURRENT', 'ACTING')),
    person_id             uuid NOT NULL,
    issuer_id             uuid NOT NULL,
    issuer_position_id    uuid NOT NULL,
    source_position_id    uuid,
    target_position_id    uuid,
    effective_date        date NOT NULL,
    reason                text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, doc_no),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, issuer_id) REFERENCES core.person (tenant_id, id),
    FOREIGN KEY (tenant_id, issuer_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, source_position_id) REFERENCES core.position (tenant_id, id),
    FOREIGN KEY (tenant_id, target_position_id) REFERENCES core.position (tenant_id, id),
    CHECK (issuer_id <> person_id),
    CHECK (decision_type <> 'APPOINT' OR (source_position_id IS NULL AND target_position_id IS NOT NULL)),
    CHECK (decision_type <> 'TRANSFER' OR (source_position_id IS NOT NULL AND target_position_id IS NOT NULL)),
    CHECK (decision_type <> 'DISMISS' OR (source_position_id IS NOT NULL AND target_position_id IS NULL))
);
CREATE INDEX ON hr.personnel_decision (tenant_id, person_id);
CREATE INDEX ON hr.personnel_decision (tenant_id, created_at DESC);
CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON hr.personnel_decision
FOR EACH ROW EXECUTE FUNCTION audit.append_only();
CALL audit.enable('hr.personnel_decision');

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION'));

CREATE FUNCTION hr.can_issue_decision(p_person uuid, p_tenant uuid, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT core.has_permission(p_person, 'hr.decision.issue', u.id, p_at)
                     FROM core.org_unit u
                     WHERE u.tenant_id = p_tenant AND u.parent_id IS NULL AND u.valid_period @> p_at
                     ORDER BY u.created_at LIMIT 1), false)
$$;

CREATE FUNCTION hr.can_read_decisions(p_person uuid, p_tenant uuid, p_at timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT core.has_permission(p_person, 'hr.decision.read', u.id, p_at)
                     FROM core.org_unit u
                     WHERE u.tenant_id = p_tenant AND u.parent_id IS NULL AND u.valid_period @> p_at
                     ORDER BY u.created_at LIMIT 1), false)
$$;

CREATE FUNCTION hr.issue_personnel_decision(p_actor uuid, p_type text, p_person uuid, p_source_position uuid,
                                            p_target_position uuid, p_kind text, p_effective date, p_reason text,
                                            p_at timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant    uuid;
    v_today     date := (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    v_from      timestamptz;
    v_issuer    uuid;
    v_src       core.assignment;
    v_target    core.position;
    v_kind      text := upper(coalesce(p_kind, 'PRIMARY'));
    v_blocker   text;
    v_id        uuid;
    v_title     text;
BEGIN
    SELECT tenant_id INTO v_tenant FROM core.person WHERE id = p_person FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Không tìm thấy người được ra quyết định';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM core.person WHERE id = p_actor AND tenant_id = v_tenant) THEN
        RAISE EXCEPTION 'Người ban hành không thuộc tenant của người được ra quyết định';
    END IF;
    IF NOT hr.can_issue_decision(p_actor, v_tenant, p_at) THEN
        RAISE EXCEPTION 'Cần quyền hr.decision.issue (Tổng giám đốc, Phó tổng giám đốc) để ban hành quyết định nhân sự';
    END IF;
    IF p_actor = p_person THEN
        RAISE EXCEPTION 'Không tự ban hành quyết định nhân sự về chính mình';
    END IF;
    IF p_type NOT IN ('APPOINT', 'TRANSFER', 'DISMISS') THEN
        RAISE EXCEPTION 'Loại quyết định không hợp lệ: %', p_type;
    END IF;
    IF p_effective IS NULL OR p_effective < v_today THEN
        RAISE EXCEPTION 'Ngày hiệu lực phải từ hôm nay trở đi';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'Quyết định nhân sự phải ghi căn cứ / lý do';
    END IF;
    v_from := hr.day_start(p_effective);

    SELECT a.position_id INTO v_issuer FROM core.assignment a
    WHERE a.person_id = p_actor AND a.assignment_type IN ('PRIMARY', 'CONCURRENT') AND a.valid_period @> p_at
    ORDER BY (a.assignment_type = 'PRIMARY') DESC LIMIT 1;
    IF v_issuer IS NULL THEN
        RAISE EXCEPTION 'Người ban hành phải đang giữ một vị trí';
    END IF;

    IF p_type IN ('APPOINT', 'TRANSFER') THEN
        SELECT * INTO v_target FROM core.position WHERE id = p_target_position AND tenant_id = v_tenant;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Không tìm thấy vị trí bổ nhiệm';
        END IF;
        IF NOT v_target.valid_period @> v_from THEN
            RAISE EXCEPTION 'Vị trí không còn hiệu lực vào ngày hiệu lực';
        END IF;
        IF hr.position_taken_from(p_target_position, v_from) THEN
            RAISE EXCEPTION 'Vị trí đã có người ngồi từ ngày hiệu lực: giải phóng vị trí trước hoặc chọn vị trí khác';
        END IF;
    END IF;

    IF p_type = 'APPOINT' THEN
        IF v_kind NOT IN ('PRIMARY', 'CONCURRENT', 'ACTING') THEN
            RAISE EXCEPTION 'Loại bổ nhiệm không hợp lệ: %', v_kind;
        END IF;
        IF v_kind = 'PRIMARY' AND EXISTS (SELECT 1 FROM core.assignment WHERE person_id = p_person
                                          AND assignment_type = 'PRIMARY') THEN
            RAISE EXCEPTION 'Người này đã có bổ nhiệm giữ chính: dùng quyết định điều chuyển để đổi vị trí';
        END IF;
        IF v_kind = 'CONCURRENT' AND NOT EXISTS (SELECT 1 FROM core.assignment WHERE person_id = p_person
                                                 AND assignment_type = 'PRIMARY' AND valid_period @> v_from) THEN
            RAISE EXCEPTION 'Kiêm nhiệm chỉ áp dụng cho người đang giữ chính một vị trí';
        END IF;
        IF v_kind = 'ACTING' AND NOT v_target.is_head THEN
            RAISE EXCEPTION 'Quyền trưởng chỉ giao cho vị trí trưởng đơn vị đang trống';
        END IF;
        IF EXISTS (SELECT 1 FROM core.assignment WHERE person_id = p_person AND position_id = p_target_position
                   AND valid_period && tstzrange(v_from, NULL)) THEN
            RAISE EXCEPTION 'Người này đã giữ vị trí đó';
        END IF;
        IF v_kind = 'PRIMARY' THEN
            PERFORM set_config('bms.transfer_applying', 'on', true);
        END IF;
        INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
        VALUES (v_tenant, p_person, p_target_position, v_kind, tstzrange(v_from, NULL));
        PERFORM set_config('bms.transfer_applying', 'off', true);
    ELSE
        SELECT * INTO v_src FROM core.assignment
        WHERE tenant_id = v_tenant AND person_id = p_person AND position_id = p_source_position
          AND assignment_type IN ('PRIMARY', 'CONCURRENT', 'ACTING') AND valid_period @> v_from;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Người này không giữ vị trí nguồn vào ngày hiệu lực';
        END IF;
        IF lower(v_src.valid_period) >= v_from THEN
            RAISE EXCEPTION 'Ngày hiệu lực phải sau ngày bắt đầu bổ nhiệm hiện tại';
        END IF;
        IF p_type = 'TRANSFER' THEN
            IF v_src.assignment_type <> 'PRIMARY' THEN
                RAISE EXCEPTION 'Điều chuyển áp dụng cho vị trí giữ chính; kiêm nhiệm hoặc quyền trưởng dùng quyết định miễn nhiệm';
            END IF;
            IF p_source_position = p_target_position THEN
                RAISE EXCEPTION 'Vị trí đến trùng vị trí hiện tại';
            END IF;
            v_blocker := hr.transfer_blocker(p_person);
            IF v_blocker IS NOT NULL THEN
                RAISE EXCEPTION '%', v_blocker;
            END IF;
            v_kind := 'PRIMARY';
            UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), v_from) WHERE id = v_src.id;
            PERFORM set_config('bms.transfer_applying', 'on', true);
            INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
            VALUES (v_tenant, p_person, p_target_position, 'PRIMARY', tstzrange(v_from, NULL));
            PERFORM set_config('bms.transfer_applying', 'off', true);
        ELSE
            IF v_src.assignment_type = 'PRIMARY' THEN
                RAISE EXCEPTION 'Không miễn nhiệm vị trí giữ chính (người sẽ không còn vị trí): dùng quyết định điều chuyển';
            END IF;
            v_kind := v_src.assignment_type;
            UPDATE core.assignment SET valid_period = tstzrange(lower(valid_period), v_from) WHERE id = v_src.id;
        END IF;
    END IF;

    INSERT INTO hr.personnel_decision (tenant_id, doc_no, decision_type, assignment_type, person_id, issuer_id,
                                       issuer_position_id, source_position_id, target_position_id, effective_date,
                                       reason, created_at)
    VALUES (v_tenant, core.next_doc_no(v_tenant, 'QD', p_at), p_type, v_kind, p_person, p_actor, v_issuer,
            p_source_position, p_target_position, p_effective, btrim(p_reason), p_at)
    RETURNING id INTO v_id;

    v_title := CASE p_type WHEN 'APPOINT' THEN 'Bạn được bổ nhiệm' WHEN 'TRANSFER' THEN 'Bạn được điều chuyển'
                           ELSE 'Bạn được miễn nhiệm' END
               || ' theo quyết định ' || (SELECT doc_no FROM hr.personnel_decision WHERE id = v_id);
    PERFORM collab.notify(v_tenant, p_person, 'HR_DECISION', 'hr.personnel_decision', v_id, v_title,
                          btrim(p_reason), p_actor);
    RETURN v_id;
END $$;
