-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

ALTER TABLE chat.member ADD COLUMN unread int NOT NULL DEFAULT 0 CHECK (unread >= 0);

CREATE FUNCTION chat.count_unread(p_conversation uuid, p_person uuid, p_after bigint) RETURNS int
LANGUAGE sql STABLE AS $$
    SELECT count(*)::int FROM chat.message
    WHERE conversation_id = p_conversation AND id > p_after AND sender_id <> p_person AND deleted_at IS NULL
$$;

UPDATE chat.member SET unread = chat.count_unread(conversation_id, person_id, last_read_id) WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION chat.member_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.tenant_id, NEW.conversation_id, NEW.person_id) IS DISTINCT FROM
       (OLD.tenant_id, OLD.conversation_id, OLD.person_id) THEN
        RAISE EXCEPTION 'Không đổi cuộc trò chuyện hoặc thành viên';
    END IF;
    NEW.last_read_id := greatest(OLD.last_read_id, NEW.last_read_id);
    IF NEW.left_at IS NOT NULL THEN
        NEW.unread := 0;
    ELSIF OLD.left_at IS NOT NULL THEN
        NEW.unread := chat.count_unread(NEW.conversation_id, NEW.person_id, NEW.last_read_id);
    ELSIF NEW.last_read_id > OLD.last_read_id THEN
        NEW.unread := greatest(0, NEW.unread - (
            SELECT count(*)::int FROM chat.message
            WHERE conversation_id = NEW.conversation_id AND id > OLD.last_read_id AND id <= NEW.last_read_id
              AND sender_id <> NEW.person_id AND deleted_at IS NULL));
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION chat.message_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE chat.member SET unread = unread + 1
        WHERE conversation_id = NEW.conversation_id AND person_id <> NEW.sender_id AND left_at IS NULL
          AND last_read_id < NEW.id;
    ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE chat.member SET unread = greatest(unread - 1, 0)
        WHERE conversation_id = NEW.conversation_id AND person_id <> NEW.sender_id AND left_at IS NULL
          AND last_read_id < NEW.id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER message_0_count AFTER INSERT OR UPDATE OF deleted_at ON chat.message
    FOR EACH ROW EXECUTE FUNCTION chat.message_count();

CREATE FUNCTION chat.member_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.last_read_id = 0 THEN
        NEW.last_read_id := coalesce((SELECT max(id) FROM chat.message WHERE conversation_id = NEW.conversation_id), 0);
    END IF;
    NEW.unread := 0;
    RETURN NEW;
END $$;
CREATE TRIGGER member_before_insert BEFORE INSERT ON chat.member
    FOR EACH ROW EXECUTE FUNCTION chat.member_before_insert();

CREATE OR REPLACE FUNCTION chat.conversation_unread(p_row chat.conversation, hasura_session json) RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT unread FROM chat.member
                     WHERE conversation_id = p_row.id AND person_id = core.session_person(hasura_session)
                       AND left_at IS NULL), 0)
$$;

CREATE OR REPLACE FUNCTION chat.sync_units(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO chat.conversation (tenant_id, kind, org_unit_id)
    SELECT u.tenant_id, 'UNIT', u.id FROM core.org_unit u
    WHERE u.tenant_id = p_tenant AND u.valid_period @> now()
      AND NOT EXISTS (SELECT FROM chat.conversation c WHERE c.tenant_id = u.tenant_id AND c.org_unit_id = u.id);

    CREATE TEMP TABLE IF NOT EXISTS chat_should (conversation_id uuid, person_id uuid, PRIMARY KEY (conversation_id, person_id))
        ON COMMIT DROP;
    DELETE FROM chat_should;
    INSERT INTO chat_should SELECT * FROM chat.unit_members(p_tenant);

    INSERT INTO chat.member (tenant_id, conversation_id, person_id, source)
    SELECT p_tenant, s.conversation_id, s.person_id, 'UNIT' FROM chat_should s
    WHERE NOT EXISTS (SELECT FROM chat.member m WHERE m.conversation_id = s.conversation_id
                                                AND m.person_id = s.person_id AND m.left_at IS NULL)
    ON CONFLICT (conversation_id, person_id) DO UPDATE SET left_at = NULL, joined_at = now();

    UPDATE chat.member m SET left_at = now()
    FROM chat.conversation c
    WHERE c.id = m.conversation_id AND c.tenant_id = p_tenant AND c.kind = 'UNIT' AND m.left_at IS NULL
      AND NOT EXISTS (SELECT FROM chat_should s WHERE s.conversation_id = m.conversation_id AND s.person_id = m.person_id);
END $$;

CREATE FUNCTION chat.assignment_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
BEGIN
    FOR v_tenant IN
        SELECT DISTINCT n.tenant_id FROM new_rows n JOIN old_rows o ON o.id = n.id
        WHERE (n.person_id, n.position_id, n.valid_period) IS DISTINCT FROM (o.person_id, o.position_id, o.valid_period)
    LOOP
        PERFORM chat.sync_units(v_tenant);
    END LOOP;
    RETURN NULL;
END $$;
DROP TRIGGER chat_sync_upd ON core.assignment;
CREATE TRIGGER chat_sync_upd AFTER UPDATE ON core.assignment REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_updated();

CREATE FUNCTION chat.org_unit_updated() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
BEGIN
    FOR v_tenant IN
        SELECT DISTINCT n.tenant_id FROM new_rows n JOIN old_rows o ON o.id = n.id
        WHERE (n.path, n.valid_period) IS DISTINCT FROM (o.path, o.valid_period)
    LOOP
        PERFORM chat.sync_units(v_tenant);
    END LOOP;
    RETURN NULL;
END $$;
DROP TRIGGER chat_sync_unit_upd ON core.org_unit;
CREATE TRIGGER chat_sync_unit_upd AFTER UPDATE ON core.org_unit REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.org_unit_updated();

CREATE OR REPLACE FUNCTION cal.occurrences(p_event cal.event, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (occurs_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_len    interval := p_event.ends_at - p_event.starts_at;
    v_start  timestamp := p_event.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_from   timestamp := (p_from - v_len) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_step   interval;
    v_n      int;
    v_at     timestamp;
BEGIN
    IF p_event.recurrence = 'NONE' THEN
        IF p_event.starts_at < p_to AND p_event.ends_at > p_from THEN
            occurs_at := p_event.starts_at; ends_at := p_event.ends_at; RETURN NEXT;
        END IF;
        RETURN;
    END IF;
    v_step := CASE p_event.recurrence WHEN 'DAILY' THEN interval '1 day' WHEN 'WEEKLY' THEN interval '1 week'
                                      ELSE interval '1 month' END;
    IF p_event.recurrence = 'MONTHLY' THEN
        v_n := greatest(0, (extract(year FROM v_from) - extract(year FROM v_start))::int * 12
                           + (extract(month FROM v_from) - extract(month FROM v_start))::int - 1);
    ELSE
        v_n := greatest(0, floor(extract(epoch FROM v_from - v_start) / extract(epoch FROM v_step))::int - 1);
    END IF;
    LOOP
        v_at := v_start + v_n * v_step;
        EXIT WHEN v_at::date > p_event.recur_until OR (v_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= p_to OR v_n > 800;
        IF (v_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + v_len > p_from THEN
            occurs_at := v_at AT TIME ZONE 'Asia/Ho_Chi_Minh'; ends_at := occurs_at + v_len; RETURN NEXT;
        END IF;
        v_n := v_n + 1;
    END LOOP;
END $$;

CREATE FUNCTION cal.last_end(p_recurrence text, p_ends_at timestamptz, p_starts_at timestamptz, p_until date)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_recurrence = 'NONE' THEN p_ends_at
                ELSE ((p_until + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') + (p_ends_at - p_starts_at) END
$$;
CREATE INDEX event_active ON cal.event (tenant_id, cal.last_end(recurrence, ends_at, starts_at, recur_until))
    WHERE cancelled_at IS NULL;
CREATE INDEX event_reminder ON cal.event (cal.last_end(recurrence, ends_at, starts_at, recur_until))
    WHERE cancelled_at IS NULL AND reminder_minutes IS NOT NULL;

CREATE OR REPLACE FUNCTION cal.send_reminders() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
    r       record;
    v_count int := 0;
BEGIN
    FOR r IN
        SELECT e.tenant_id, e.id, e.title, e.location, o.occurs_at, x.person_id
        FROM cal.event e
        CROSS JOIN LATERAL cal.occurrences(e, now() - interval '1 minute', now() + interval '7 days') o
        CROSS JOIN LATERAL (
            SELECT e.organizer_id AS person_id
            UNION
            SELECT a.person_id FROM cal.attendee a WHERE a.event_id = e.id AND a.response <> 'DECLINED'
        ) x
        WHERE e.cancelled_at IS NULL AND e.reminder_minutes IS NOT NULL
          AND cal.last_end(e.recurrence, e.ends_at, e.starts_at, e.recur_until) > now() - interval '1 minute'
          AND e.starts_at < now() + interval '7 days'
          AND o.occurs_at - make_interval(mins => e.reminder_minutes) <= now()
          AND o.occurs_at > now() - interval '1 minute'
          AND NOT EXISTS (SELECT FROM cal.reminder_sent s
                          WHERE s.event_id = e.id AND s.person_id = x.person_id AND s.occurs_at = o.occurs_at)
    LOOP
        INSERT INTO cal.reminder_sent (event_id, person_id, occurs_at) VALUES (r.id, r.person_id, r.occurs_at);
        PERFORM collab.notify(r.tenant_id, r.person_id, 'CALENDAR_REMINDER', 'cal.event', r.id,
                              'Sắp đến lịch: ' || r.title,
                              to_char(r.occurs_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
                                  || coalesce(' · ' || r.location, ''));
        v_count := v_count + 1;
    END LOOP;
    IF random() < 0.01 THEN
        DELETE FROM cal.reminder_sent WHERE occurs_at < now() - interval '30 days';
    END IF;
    RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION cal.can_read(p_event uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT FROM cal.event e
        WHERE e.id = p_event AND (
            e.organizer_id = p_person
            OR EXISTS (SELECT FROM cal.attendee a WHERE a.event_id = e.id AND a.person_id = p_person)
            OR (e.scope = 'UNIT' AND EXISTS (
                SELECT FROM core.assignment a
                JOIN core.position p ON p.id = a.position_id AND p.valid_period @> now()
                JOIN core.org_unit d ON d.id = p.org_unit_id
                JOIN core.org_unit u ON u.id = e.org_unit_id AND d.path <@ u.path
                WHERE a.tenant_id = e.tenant_id AND a.person_id = p_person AND a.valid_period @> now()))))
$$;

CREATE INDEX task_parent ON pm.task (parent_id) WHERE parent_id IS NOT NULL;

CREATE FUNCTION pm.project_stats(p_row pm.project) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT to_jsonb(s) FROM pm.stats(p_row.id) s $$;
DROP FUNCTION pm.project_progress(pm.project);
DROP FUNCTION pm.project_planned(pm.project);
DROP FUNCTION pm.project_late_tasks(pm.project);

ALTER TABLE api.usage ADD COLUMN last_used_at timestamptz, ADD COLUMN last_ip inet;
UPDATE api.usage u SET last_used_at = k.last_used_at, last_ip = k.last_ip
FROM api.api_key k
WHERE k.id = u.key_id AND u.day = (SELECT max(day) FROM api.usage x WHERE x.key_id = k.id);
INSERT INTO api.usage (key_id, day, last_used_at, last_ip)
SELECT id, last_used_at::date, last_used_at, last_ip FROM api.api_key k
WHERE last_used_at IS NOT NULL AND NOT EXISTS (SELECT FROM api.usage u WHERE u.key_id = k.id)
ON CONFLICT DO NOTHING;
ALTER TABLE api.api_key DROP COLUMN last_used_at, DROP COLUMN last_ip;

CREATE FUNCTION api.api_key_last_used_at(p_row api.api_key) RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT max(last_used_at) FROM api.usage WHERE key_id = p_row.id $$;
CREATE FUNCTION api.api_key_last_ip(p_row api.api_key) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT host(last_ip) FROM api.usage WHERE key_id = p_row.id AND last_used_at IS NOT NULL
    ORDER BY last_used_at DESC LIMIT 1
$$;
