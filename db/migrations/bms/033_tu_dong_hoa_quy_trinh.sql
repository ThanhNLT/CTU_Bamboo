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

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION'));

CREATE TABLE wf.process_automation (
    tenant_id              uuid NOT NULL REFERENCES core.tenant,
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id               uuid NOT NULL,
    version                int NOT NULL CHECK (version > 0),
    flowable_deployment_id text NOT NULL,
    flowable_definition_id text NOT NULL,
    definition_key         text NOT NULL,
    status                 text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STOPPED')),
    actions                jsonb NOT NULL DEFAULT '{}',
    activated_by           uuid NOT NULL,
    activated_at           timestamptz NOT NULL DEFAULT now(),
    stopped_at             timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, model_id) REFERENCES wf.process_model (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, activated_by) REFERENCES core.person (tenant_id, id),
    CHECK ((status = 'STOPPED') = (stopped_at IS NOT NULL))
);
CREATE UNIQUE INDEX process_automation_one_active ON wf.process_automation (model_id) WHERE status = 'ACTIVE';
CREATE INDEX ON wf.process_automation (flowable_definition_id) WHERE status = 'ACTIVE';
COMMENT ON COLUMN wf.process_automation.actions IS 'Mã phần tử → tham số hành động tự động (action, audience, message)';
CALL audit.enable('wf.process_automation');

CREATE TABLE wf.automation_run (
    tenant_id            uuid NOT NULL REFERENCES core.tenant,
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id        uuid NOT NULL,
    flowable_instance_id text NOT NULL UNIQUE,
    trigger              text NOT NULL CHECK (trigger IN ('MANUAL', 'TIMER')),
    started_by           uuid,
    status               text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    variables            jsonb NOT NULL DEFAULT '{}',
    steps                jsonb NOT NULL DEFAULT '[]',
    notified             int NOT NULL DEFAULT 0,
    error                text,
    started_at           timestamptz NOT NULL DEFAULT now(),
    ended_at             timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, automation_id) REFERENCES wf.process_automation (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, started_by) REFERENCES core.person (tenant_id, id)
);
CREATE INDEX ON wf.automation_run (tenant_id, automation_id, started_at DESC);
CREATE INDEX ON wf.automation_run (status) WHERE status = 'RUNNING';

CREATE FUNCTION wf.automation_notify(p_run uuid, p_activity text) RETURNS int
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
    v_msg := coalesce(nullif(btrim(v_param ->> 'message'), ''), 'Quy trình tự động đang chạy');
    IF v_aud = 'INITIATOR' THEN
        PERFORM collab.notify(a.tenant_id, coalesce(r.started_by, a.activated_by), 'PROCESS_AUTOMATION',
                              'wf.process_model', m.id, format('Quy trình “%s”: %s', m.name, v_msg),
                              format('Lần chạy %s', to_char(r.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                                            'DD/MM/YYYY HH24:MI')),
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
