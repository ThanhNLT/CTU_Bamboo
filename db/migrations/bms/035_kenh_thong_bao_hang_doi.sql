-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

CREATE SCHEMA msg;

CREATE TABLE msg.queue (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic            text NOT NULL CHECK (topic ~ '^[a-z][a-z0-9_.-]{1,60}$'),
    payload          jsonb NOT NULL,
    payload_sha256   text NOT NULL,
    idempotency_key  text,
    status           text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'LEASED', 'DELIVERED', 'DEAD')),
    attempts         int NOT NULL DEFAULT 0,
    max_attempts     int NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
    next_attempt_at  timestamptz NOT NULL DEFAULT now(),
    leased_until     timestamptz,
    lease_owner      text,
    last_error       text,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    delivered_at     timestamptz,
    receipt          jsonb,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK ((status = 'DELIVERED') = (delivered_at IS NOT NULL AND receipt IS NOT NULL))
);
CREATE INDEX queue_due ON msg.queue (topic, next_attempt_at) WHERE status IN ('PENDING', 'LEASED');
CREATE INDEX ON msg.queue (tenant_id, created_at DESC);
CREATE INDEX ON msg.queue (tenant_id, status);

CREATE TABLE msg.attempt (
    id           bigserial PRIMARY KEY,
    message_id   uuid NOT NULL REFERENCES msg.queue (id) ON DELETE CASCADE,
    attempt      int NOT NULL,
    started_at   timestamptz NOT NULL DEFAULT now(),
    ok           boolean NOT NULL,
    detail       text
);
CREATE INDEX ON msg.attempt (message_id, attempt);

CREATE FUNCTION msg.queue_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.payload_sha256 := encode(sha256(convert_to(NEW.payload::text, 'UTF8')), 'hex');
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.topic, NEW.payload, NEW.payload_sha256, NEW.idempotency_key, NEW.created_at)
       IS DISTINCT FROM (OLD.tenant_id, OLD.topic, OLD.payload, OLD.payload_sha256, OLD.idempotency_key, OLD.created_at) THEN
        RAISE EXCEPTION 'Không sửa nội dung tin nhắn đã vào hàng đợi' USING ERRCODE = 'data_exception';
    END IF;
    IF OLD.status = 'DELIVERED' THEN
        RAISE EXCEPTION 'Tin nhắn đã giao, không đổi nữa' USING ERRCODE = 'data_exception';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER queue_before_write BEFORE INSERT OR UPDATE ON msg.queue
FOR EACH ROW EXECUTE FUNCTION msg.queue_before_write();

CREATE FUNCTION msg.enqueue(p_tenant uuid, p_topic text, p_payload jsonb, p_idempotency text DEFAULT NULL,
                            p_created_by uuid DEFAULT NULL, p_max_attempts int DEFAULT 5,
                            p_delay interval DEFAULT interval '0')
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO msg.queue (tenant_id, topic, payload, idempotency_key, created_by, max_attempts, next_attempt_at)
    VALUES (p_tenant, p_topic, p_payload, p_idempotency, p_created_by, p_max_attempts, now() + p_delay)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        SELECT id INTO v_id FROM msg.queue WHERE tenant_id = p_tenant AND idempotency_key = p_idempotency;
    ELSE
        PERFORM pg_notify('msg_queue', p_topic);
    END IF;
    RETURN v_id;
END $$;

CREATE FUNCTION msg.lease(p_prefix text, p_owner text, p_limit int DEFAULT 10, p_lease interval DEFAULT interval '2 minutes')
RETURNS SETOF msg.queue
LANGUAGE sql AS $$
    UPDATE msg.queue q SET status = 'LEASED', lease_owner = p_owner, leased_until = now() + p_lease,
                           attempts = q.attempts + 1
    WHERE q.id IN (
        SELECT id FROM msg.queue
        WHERE topic LIKE p_prefix || '%'
          AND ((status = 'PENDING' AND next_attempt_at <= now()) OR (status = 'LEASED' AND leased_until < now()))
        ORDER BY next_attempt_at
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit)
    RETURNING q.*
$$;

CREATE FUNCTION msg.complete(p_id uuid, p_receipt jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE msg.queue SET status = 'DELIVERED', delivered_at = now(), receipt = p_receipt, last_error = NULL,
                         lease_owner = NULL, leased_until = NULL
    WHERE id = p_id AND status = 'LEASED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tin nhắn % không ở trạng thái đang giữ', p_id;
    END IF;
    INSERT INTO msg.attempt (message_id, attempt, ok, detail)
    SELECT id, attempts, true, p_receipt ->> 'provider_id' FROM msg.queue WHERE id = p_id;
END $$;

CREATE FUNCTION msg.fail(p_id uuid, p_error text, p_permanent boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    q msg.queue;
BEGIN
    SELECT * INTO q FROM msg.queue WHERE id = p_id AND status = 'LEASED' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tin nhắn % không ở trạng thái đang giữ', p_id;
    END IF;
    INSERT INTO msg.attempt (message_id, attempt, ok, detail) VALUES (p_id, q.attempts, false, left(p_error, 500));
    IF p_permanent OR q.attempts >= q.max_attempts THEN
        UPDATE msg.queue SET status = 'DEAD', last_error = left(p_error, 500), lease_owner = NULL, leased_until = NULL
        WHERE id = p_id;
        RETURN 'DEAD';
    END IF;
    UPDATE msg.queue
    SET status = 'PENDING', last_error = left(p_error, 500), lease_owner = NULL, leased_until = NULL,
        next_attempt_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, q.attempts - 1))
    WHERE id = p_id;
    RETURN 'PENDING';
END $$;

CREATE FUNCTION msg.retry(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE msg.queue SET status = 'PENDING', attempts = 0, next_attempt_at = now(), last_error = NULL
    WHERE id = p_id AND status = 'DEAD';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Chỉ đưa lại được tin nhắn trong hàng chết';
    END IF;
    PERFORM pg_notify('msg_queue', (SELECT topic FROM msg.queue WHERE id = p_id));
END $$;

CREATE TABLE collab.notification_pref (
    tenant_id   uuid NOT NULL REFERENCES core.tenant,
    person_id   uuid NOT NULL,
    channel     text NOT NULL CHECK (channel IN ('EMAIL', 'SMS', 'WEBHOOK')),
    enabled     boolean NOT NULL DEFAULT true,
    address     text NOT NULL CHECK (length(address) BETWEEN 3 AND 500),
    kinds       text[],
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, person_id, channel),
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE,
    CHECK (channel <> 'EMAIL' OR address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CHECK (channel <> 'SMS' OR address ~ '^\+?[0-9]{8,15}$'),
    CHECK (channel <> 'WEBHOOK' OR address ~ '^https://[^\s]+$')
);
CALL audit.enable('collab.notification_pref', 'tenant_id', 'person_id', 'channel');

CREATE FUNCTION collab.notification_fanout() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO msg.queue (tenant_id, topic, payload, idempotency_key, created_by)
    SELECT NEW.tenant_id, 'notify.' || lower(p.channel),
           jsonb_build_object('notification_id', NEW.id, 'recipient_id', NEW.recipient_id, 'address', p.address,
                              'kind', NEW.kind, 'title', NEW.title, 'body', NEW.body,
                              'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id),
           'n:' || NEW.id || ':' || p.channel, NEW.actor_id
    FROM collab.notification_pref p
    WHERE p.tenant_id = NEW.tenant_id AND p.person_id = NEW.recipient_id AND p.enabled
      AND (p.kinds IS NULL OR NEW.kind = ANY (p.kinds))
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    PERFORM pg_notify('msg_queue', 'notify');
    RETURN NULL;
END $$;
CREATE TRIGGER notification_fanout AFTER INSERT ON collab.notification
FOR EACH ROW EXECUTE FUNCTION collab.notification_fanout();
