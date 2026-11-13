-- Bamboo - DX-OS Open-Core
-- @version 0.5.1
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

CREATE FUNCTION wf.automation_in_scope(p_automation uuid, p_unit_ids jsonb, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM wf.process_automation a
        JOIN wf.process_model m ON m.id = a.model_id
        JOIN wf.process_version v ON v.model_id = a.model_id AND v.version = a.version
        JOIN core.org_unit s ON s.id = wf.audience_scope(a.tenant_id, m.owner_unit_id, v.audience, p_at)
        JOIN core.org_unit u ON u.tenant_id = a.tenant_id
             AND u.id IN (SELECT x::uuid FROM jsonb_array_elements_text(coalesce(p_unit_ids, '[]')) x)
             AND u.path <@ s.path
        WHERE a.id = p_automation
    )
$$;
COMMENT ON FUNCTION wf.automation_in_scope IS 'Sự kiện có ít nhất một đơn vị liên quan nằm trong cây con của phạm vi quy trình tự động; sự kiện không mang đơn vị thì không khớp';

CREATE OR REPLACE FUNCTION wf.purchase_request_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'purchase_request.' || lower(NEW.status), NEW.id::text || ':' || NEW.approval_round,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'amount', NEW.total_amount, 'status', NEW.status,
                           'requester_id', NEW.requester_id, 'unit_ids', jsonb_build_array(NEW.org_unit_id)));
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wf.onboarding_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'onboarding.' || lower(NEW.status), NEW.id::text || ':' || NEW.approval_round,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'status', NEW.status,
                           'unit_ids', jsonb_build_array(NEW.org_unit_id, NEW.target_unit_id)));
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wf.personnel_decision_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'personnel_decision.issued', NEW.id::text,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'status', NEW.decision_type,
                           'unit_ids', (SELECT coalesce(jsonb_agg(DISTINCT p.org_unit_id), '[]') FROM core.position p
                                        WHERE p.id IN (NEW.source_position_id, NEW.target_position_id))));
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wf.ic_order_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'ic_order.' || lower(NEW.status), NEW.id::text,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'amount', NEW.total_amount, 'status', NEW.status,
                           'unit_ids', jsonb_build_array(NEW.seller_unit_id, NEW.buyer_unit_id)));
    RETURN NULL;
END $$;
