-- Bamboo - DX-OS Open-Core
-- @version 0.5.2
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/ThanhNLT/CTU_Bamboo, Bamboo project
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
