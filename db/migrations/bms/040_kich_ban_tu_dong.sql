-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

ALTER TABLE wf.process_automation
    ADD COLUMN webhook_sha256 text,
    ADD COLUMN events text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX process_automation_webhook ON wf.process_automation (webhook_sha256) WHERE webhook_sha256 IS NOT NULL;

ALTER TABLE wf.automation_run DROP CONSTRAINT automation_run_trigger_check,
    ADD CHECK (trigger IN ('MANUAL', 'TIMER', 'WEBHOOK', 'EVENT'));

DROP FUNCTION wf.automation_notify(uuid, text);
CREATE FUNCTION wf.automation_notify(p_run uuid, p_activity text, p_message text DEFAULT NULL) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
    r        wf.automation_run;
    a        wf.process_automation;
    m        wf.process_model;
    v_param  jsonb;
    v_aud    text;
    v_msg    text;
    v_person uuid;
    v_count  int := 0;
BEGIN
    SELECT * INTO r FROM wf.automation_run WHERE id = p_run;
    SELECT * INTO a FROM wf.process_automation WHERE id = r.automation_id;
    SELECT * INTO m FROM wf.process_model WHERE id = a.model_id;
    v_param := a.actions -> p_activity;
    IF v_param IS NULL OR v_param ->> 'action' IS DISTINCT FROM 'notify' THEN
        RAISE EXCEPTION 'Phần tử % không có hành động gửi thông báo', p_activity;
    END IF;
    v_aud := coalesce(v_param ->> 'audience', 'INITIATOR');
    v_msg := coalesce(nullif(btrim(p_message), ''), nullif(btrim(v_param ->> 'message'), ''), 'Quy trình tự động đang chạy');
    IF v_aud = 'INITIATOR' THEN
        PERFORM collab.notify(a.tenant_id, coalesce(r.started_by, a.activated_by), 'PROCESS_AUTOMATION',
                              'wf.process_model', m.id, format('Quy trình “%s”: %s', m.name, v_msg),
                              format('Lần chạy %s', to_char(r.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')),
                              NULL);
        RETURN 1;
    END IF;
    FOR v_person IN SELECT wf.people_under(wf.audience_scope(a.tenant_id, m.owner_unit_id, v_aud)) LOOP
        PERFORM collab.notify(a.tenant_id, v_person, 'PROCESS_AUTOMATION', 'wf.process_model', m.id,
                              format('Quy trình “%s”: %s', m.name, v_msg), NULL, NULL);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END $$;

CREATE FUNCTION wf.emit_event(p_tenant uuid, p_name text, p_key text, p_payload jsonb) RETURNS void
LANGUAGE sql AS $$
    SELECT msg.enqueue(p_tenant, 'event.' || p_name, p_payload, 'ev:' || p_name || ':' || p_key)
$$;

CREATE FUNCTION wf.purchase_request_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'purchase_request.' || lower(NEW.status), NEW.id::text || ':' || NEW.approval_round,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'amount', NEW.total_amount, 'status', NEW.status,
                           'requester_id', NEW.requester_id));
    RETURN NULL;
END $$;
CREATE TRIGGER purchase_request_event AFTER UPDATE OF status ON proc.purchase_request
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('PENDING', 'APPROVED', 'REJECTED'))
EXECUTE FUNCTION wf.purchase_request_event();

CREATE FUNCTION wf.onboarding_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'onboarding.' || lower(NEW.status), NEW.id::text || ':' || NEW.approval_round,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'status', NEW.status));
    RETURN NULL;
END $$;
CREATE TRIGGER onboarding_event AFTER UPDATE OF status ON hr.onboarding_request
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('PENDING', 'APPROVED', 'REJECTED'))
EXECUTE FUNCTION wf.onboarding_event();

CREATE FUNCTION wf.personnel_decision_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'personnel_decision.issued', NEW.id::text,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'status', NEW.decision_type));
    RETURN NULL;
END $$;
CREATE TRIGGER personnel_decision_event AFTER INSERT ON hr.personnel_decision
FOR EACH ROW EXECUTE FUNCTION wf.personnel_decision_event();

CREATE FUNCTION wf.ic_order_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM wf.emit_event(
        NEW.tenant_id, 'ic_order.' || lower(NEW.status), NEW.id::text,
        jsonb_build_object('entity_id', NEW.id, 'doc_no', NEW.doc_no, 'amount', NEW.total_amount, 'status', NEW.status));
    RETURN NULL;
END $$;
CREATE TRIGGER ic_order_event AFTER UPDATE OF status ON ic.ic_order
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('CONFIRMED', 'SETTLED'))
EXECUTE FUNCTION wf.ic_order_event();
