-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Quyết định nhân sự theo phạm vi đơn vị: quyền hr.decision.issue / hr.decision.read được cấp theo cây đơn vị
-- (TENANT, SUBTREE, UNIT) nên giám đốc công ty con chỉ ban hành và xem quyết định trong công ty mình; Tổng giám đốc
-- (cấp TENANT) vẫn ban hành và xem toàn tập đoàn. Trước đây quyền chỉ được kiểm tại đơn vị gốc.

-- "Có quyền ở đâu đó": dùng để hiện chức năng; phạm vi cụ thể do trigger bên dưới kiểm theo từng vị trí
CREATE OR REPLACE FUNCTION hr.can_issue_decision(p_person uuid, p_tenant uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM core.org_unit u
                   WHERE u.tenant_id = p_tenant AND u.valid_period @> p_at
                     AND core.has_permission(p_person, 'hr.decision.issue', u.id, p_at))
$$;

CREATE OR REPLACE FUNCTION hr.can_read_decisions(p_person uuid, p_tenant uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM core.org_unit u
                   WHERE u.tenant_id = p_tenant AND u.valid_period @> p_at
                     AND core.has_permission(p_person, 'hr.decision.read', u.id, p_at))
$$;

-- Người ban hành phải có quyền ban hành tại đơn vị của mọi vị trí liên quan (nguồn và đích)
CREATE FUNCTION hr.check_decision_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_unit uuid;
BEGIN
    FOR v_unit IN SELECT DISTINCT p.org_unit_id FROM core.position p
                  WHERE p.id IN (NEW.source_position_id, NEW.target_position_id) LOOP
        IF NOT core.has_permission(NEW.issuer_id, 'hr.decision.issue', v_unit, NEW.created_at) THEN
            RAISE EXCEPTION 'Quyết định nhân sự vượt phạm vi: người ban hành không có quyền hr.decision.issue tại đơn vị %',
                (SELECT name FROM core.org_unit WHERE id = v_unit);
        END IF;
    END LOOP;
    RETURN NEW;
END $$;
CREATE TRIGGER check_scope BEFORE INSERT ON hr.personnel_decision
FOR EACH ROW EXECUTE FUNCTION hr.check_decision_scope();
