-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- 053: Không gian H (ADR #65): nhắn tin cá nhân/nhóm/phòng ban và lịch công tác.
-- Hai schema mới `chat`, `cal` không nằm trong publication CDC: tin nhắn là trao đổi riêng, không đưa vào Kafka/Lakehouse
-- và không ghi nhật ký kiểm toán nội dung (nhật ký kiểm toán do quản trị viên đọc được).

CREATE SCHEMA chat;
CREATE SCHEMA cal;

ALTER TABLE collab.notification
    DROP CONSTRAINT notification_kind_check,
    ADD CHECK (kind IN ('TASK_ASSIGNED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RETURNED',
                        'REQUEST_CANCELLED', 'COMMENT', 'MENTION',
                        'IC_ORDER_NEW', 'IC_ORDER_CONFIRMED', 'IC_ORDER_REJECTED', 'IC_ORDER_CANCELLED',
                        'HR_DECISION',
                        'PROCESS_PUBLISHED', 'PROCESS_CHANGE_REQUESTED', 'PROCESS_CHANGE_RESOLVED',
                        'PROCESS_AUTOMATION', 'SECURITY', 'EXTERNAL',
                        'CHAT_MESSAGE', 'CALENDAR_INVITE', 'CALENDAR_REMINDER', 'CALENDAR_CHANGED'));

-- ---------------------------------------------------------------------------------------------------------------
-- Nhắn tin. Ba loại cuộc trò chuyện:
--   DIRECT  hai người, mỗi cặp một cuộc (direct_key là cặp mã người đã sắp xếp)
--   GROUP   nhóm tự lập, người tạo là chủ nhóm, thêm/bớt thành viên được
--   UNIT    kênh của một đơn vị: thành viên là người đang có vị trí trong cây con của đơn vị, hệ thống tự đồng bộ
--           theo phân công (chuyển phòng thì tự rời kênh cũ, vào kênh mới)
CREATE TABLE chat.conversation (
    tenant_id        uuid NOT NULL REFERENCES core.tenant,
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind             text NOT NULL CHECK (kind IN ('DIRECT', 'GROUP', 'UNIT')),
    title            text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 120),
    org_unit_id      uuid,
    direct_key       text,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_message_at  timestamptz,
    last_preview     text,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, org_unit_id),
    UNIQUE (tenant_id, direct_key),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, created_by) REFERENCES core.person (tenant_id, id),
    CHECK ((kind = 'UNIT') = (org_unit_id IS NOT NULL)),
    CHECK ((kind = 'DIRECT') = (direct_key IS NOT NULL)),
    CHECK (kind <> 'GROUP' OR title IS NOT NULL)
);
CREATE INDEX conversation_recent ON chat.conversation (tenant_id, last_message_at DESC NULLS LAST);

CREATE TABLE chat.member (
    tenant_id        uuid NOT NULL,
    conversation_id  uuid NOT NULL,
    person_id        uuid NOT NULL,
    role             text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER')),
    source           text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'UNIT')),
    joined_at        timestamptz NOT NULL DEFAULT now(),
    left_at          timestamptz,
    last_read_id     bigint NOT NULL DEFAULT 0,
    muted            boolean NOT NULL DEFAULT false,
    PRIMARY KEY (conversation_id, person_id),
    FOREIGN KEY (tenant_id, conversation_id) REFERENCES chat.conversation (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX member_person ON chat.member (tenant_id, person_id) WHERE left_at IS NULL;

CREATE TABLE chat.message (
    tenant_id        uuid NOT NULL,
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id  uuid NOT NULL,
    sender_id        uuid NOT NULL,
    body             text NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
    attachment_id    uuid REFERENCES core.attachment,
    reply_to_id      bigint REFERENCES chat.message ON DELETE SET NULL,
    mentions         uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(mentions) <= 50),
    created_at       timestamptz NOT NULL DEFAULT now(),
    edited_at        timestamptz,
    deleted_at       timestamptz,
    FOREIGN KEY (tenant_id, conversation_id) REFERENCES chat.conversation (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, sender_id) REFERENCES core.person (tenant_id, id),
    CHECK (deleted_at IS NOT NULL OR btrim(body) <> '' OR attachment_id IS NOT NULL)
);
CREATE INDEX message_conversation ON chat.message (conversation_id, id DESC);
CREATE INDEX message_search ON chat.message USING gin (to_tsvector('simple', body));

-- Người đang là thành viên (chưa rời) của cuộc trò chuyện
CREATE FUNCTION chat.is_member(p_conversation uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT FROM chat.member
                   WHERE conversation_id = p_conversation AND person_id = p_person AND left_at IS NULL)
$$;

CREATE FUNCTION chat.conversation_can_read(p_row chat.conversation, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT chat.is_member(p_row.id, core.session_person(hasura_session)) $$;

-- Số tin chưa đọc của người gọi (không tính tin của chính mình, tin đã thu hồi)
CREATE FUNCTION chat.conversation_unread(p_row chat.conversation, hasura_session json) RETURNS integer
LANGUAGE sql STABLE AS $$
    SELECT count(*)::int
    FROM chat.member m
    JOIN chat.message g ON g.conversation_id = m.conversation_id AND g.id > m.last_read_id
    WHERE m.conversation_id = p_row.id AND m.person_id = core.session_person(hasura_session) AND m.left_at IS NULL
      AND g.sender_id <> m.person_id AND g.deleted_at IS NULL
$$;

-- Tên hiển thị theo người xem: cuộc hai người hiện tên người kia, kênh đơn vị hiện tên đơn vị
CREATE FUNCTION chat.conversation_display_name(p_row chat.conversation, hasura_session json) RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE p_row.kind
        WHEN 'UNIT' THEN (SELECT name FROM core.org_unit WHERE id = p_row.org_unit_id)
        WHEN 'DIRECT' THEN coalesce((
            SELECT p.full_name FROM chat.member m JOIN core.person p ON p.id = m.person_id
            WHERE m.conversation_id = p_row.id AND m.person_id <> core.session_person(hasura_session)
            LIMIT 1), p_row.title)
        ELSE p_row.title
    END
$$;

-- Đồng bộ kênh đơn vị: mỗi đơn vị còn hiệu lực có một kênh; thành viên = người có phân công còn hiệu lực ở vị trí thuộc
-- cây con của đơn vị. Người không còn thuộc đơn vị thì rời kênh (giữ lịch sử, không xóa tin đã gửi).
CREATE FUNCTION chat.unit_members(p_tenant uuid) RETURNS TABLE (conversation_id uuid, person_id uuid)
LANGUAGE sql STABLE AS $$
    SELECT DISTINCT c.id, a.person_id
    FROM chat.conversation c
    JOIN core.org_unit u ON u.id = c.org_unit_id
    JOIN core.org_unit d ON d.tenant_id = u.tenant_id AND d.path <@ u.path AND d.valid_period @> now()
    JOIN core.position p ON p.tenant_id = d.tenant_id AND p.org_unit_id = d.id AND p.valid_period @> now()
    JOIN core.assignment a ON a.tenant_id = p.tenant_id AND a.position_id = p.id AND a.valid_period @> now()
    WHERE c.tenant_id = p_tenant AND c.kind = 'UNIT'
$$;

CREATE FUNCTION chat.sync_units(p_tenant uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO chat.conversation (tenant_id, kind, org_unit_id)
    SELECT u.tenant_id, 'UNIT', u.id FROM core.org_unit u
    WHERE u.tenant_id = p_tenant AND u.valid_period @> now()
    ON CONFLICT (tenant_id, org_unit_id) DO NOTHING;

    INSERT INTO chat.member (tenant_id, conversation_id, person_id, source)
    SELECT p_tenant, s.conversation_id, s.person_id, 'UNIT' FROM chat.unit_members(p_tenant) s
    ON CONFLICT (conversation_id, person_id) DO UPDATE SET left_at = NULL, joined_at = now()
        WHERE chat.member.left_at IS NOT NULL;

    UPDATE chat.member m SET left_at = now()
    FROM chat.conversation c
    WHERE c.id = m.conversation_id AND c.tenant_id = p_tenant AND c.kind = 'UNIT' AND m.left_at IS NULL
      AND (m.conversation_id, m.person_id) NOT IN (SELECT * FROM chat.unit_members(p_tenant));
END $$;

CREATE FUNCTION chat.assignment_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
BEGIN
    FOR v_tenant IN SELECT DISTINCT tenant_id FROM changed_rows LOOP
        PERFORM chat.sync_units(v_tenant);
    END LOOP;
    RETURN NULL;
END $$;

CREATE TRIGGER chat_sync_ins AFTER INSERT ON core.assignment REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_changed();
CREATE TRIGGER chat_sync_upd AFTER UPDATE ON core.assignment REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_changed();
CREATE TRIGGER chat_sync_del AFTER DELETE ON core.assignment REFERENCING OLD TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_changed();
CREATE TRIGGER chat_sync_unit_ins AFTER INSERT ON core.org_unit REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_changed();
CREATE TRIGGER chat_sync_unit_upd AFTER UPDATE ON core.org_unit REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION chat.assignment_changed();

-- Đồng bộ định kỳ (flow-sync gọi mỗi phút): phân công hết hạn theo thời gian không sinh câu lệnh UPDATE nào
CREATE FUNCTION chat.sync_all() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_tenant uuid;
BEGIN
    FOR v_tenant IN SELECT id FROM core.tenant LOOP
        PERFORM chat.sync_units(v_tenant);
    END LOOP;
END $$;

-- Tin nhắn: người gửi phải là thành viên; tệp phải thuộc cuộc trò chuyện; tin trả lời cùng cuộc; nhắc tên người trong cuộc
CREATE FUNCTION chat.message_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT chat.is_member(NEW.conversation_id, NEW.sender_id) THEN
            RAISE EXCEPTION 'Bạn không ở trong cuộc trò chuyện này' USING ERRCODE = 'data_exception';
        END IF;
        IF NEW.attachment_id IS NOT NULL AND NOT EXISTS (
            SELECT FROM core.attachment
            WHERE id = NEW.attachment_id AND entity_type = 'chat.conversation' AND entity_id = NEW.conversation_id
              AND uploaded_by = NEW.sender_id AND deleted_at IS NULL) THEN
            RAISE EXCEPTION 'Tệp đính kèm không thuộc cuộc trò chuyện' USING ERRCODE = 'data_exception';
        END IF;
        IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
            SELECT FROM chat.message WHERE id = NEW.reply_to_id AND conversation_id = NEW.conversation_id) THEN
            RAISE EXCEPTION 'Tin được trả lời không thuộc cuộc trò chuyện' USING ERRCODE = 'data_exception';
        END IF;
        NEW.mentions := ARRAY(SELECT DISTINCT x FROM unnest(NEW.mentions) x
                              WHERE x <> NEW.sender_id AND chat.is_member(NEW.conversation_id, x));
        NEW.created_at := now();
        NEW.edited_at := NULL;
        NEW.deleted_at := NULL;
        RETURN NEW;
    END IF;
    IF (NEW.tenant_id, NEW.conversation_id, NEW.sender_id, NEW.created_at, NEW.reply_to_id)
       IS DISTINCT FROM (OLD.tenant_id, OLD.conversation_id, OLD.sender_id, OLD.created_at, OLD.reply_to_id) THEN
        RAISE EXCEPTION 'Không đổi người gửi, cuộc trò chuyện hay thời điểm gửi của tin nhắn';
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Tin nhắn đã thu hồi';
    END IF;
    IF NEW.deleted_at IS NOT NULL THEN
        -- Thu hồi: xóa nội dung, giữ dấu vết là có một tin đã thu hồi
        NEW.body := '';
        NEW.attachment_id := NULL;
        NEW.mentions := '{}';
        NEW.deleted_at := now();
        NEW.edited_at := OLD.edited_at;
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
        IF OLD.created_at < now() - interval '24 hours' THEN
            RAISE EXCEPTION 'Chỉ sửa được tin nhắn trong 24 giờ sau khi gửi';
        END IF;
        NEW.edited_at := now();
        NEW.attachment_id := OLD.attachment_id;
        NEW.mentions := OLD.mentions;
    ELSE
        NEW.attachment_id := OLD.attachment_id;
        NEW.mentions := OLD.mentions;
        NEW.edited_at := OLD.edited_at;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER message_before_write BEFORE INSERT OR UPDATE ON chat.message
    FOR EACH ROW EXECUTE FUNCTION chat.message_before_write();

CREATE FUNCTION chat.message_after_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_conv     chat.conversation;
    v_sender   text;
    v_preview  text;
    v_target   uuid;
    v_label    text;
BEGIN
    SELECT * INTO v_conv FROM chat.conversation WHERE id = NEW.conversation_id;
    SELECT full_name INTO v_sender FROM core.person WHERE id = NEW.sender_id;
    v_preview := CASE WHEN btrim(NEW.body) = '' THEN '📎 Tệp đính kèm' ELSE left(regexp_replace(NEW.body, '\s+', ' ', 'g'), 140) END;
    UPDATE chat.conversation SET last_message_at = NEW.created_at, last_preview = v_preview
    WHERE id = NEW.conversation_id;
    UPDATE chat.member SET last_read_id = NEW.id
    WHERE conversation_id = NEW.conversation_id AND person_id = NEW.sender_id;

    v_label := CASE v_conv.kind
        WHEN 'UNIT' THEN (SELECT name FROM core.org_unit WHERE id = v_conv.org_unit_id)
        WHEN 'GROUP' THEN v_conv.title
        ELSE NULL END;

    -- Người được nhắc tên nhận thông báo (đi theo kênh thông báo ngoài ứng dụng nếu họ đã bật cho loại MENTION)
    FOREACH v_target IN ARRAY NEW.mentions LOOP
        IF NOT EXISTS (SELECT FROM chat.member WHERE conversation_id = NEW.conversation_id AND person_id = v_target
                                                 AND muted) THEN
            PERFORM collab.notify(NEW.tenant_id, v_target, 'MENTION', 'chat.conversation', NEW.conversation_id,
                                  v_sender || ' nhắc đến bạn' || coalesce(' trong ' || v_label, ''), v_preview,
                                  NEW.sender_id);
        END IF;
    END LOOP;

    -- Tin nhắn riêng: người đã ẩn cuộc trò chuyện thấy lại khi có tin mới; báo cho người nhận khi họ không mở ứng dụng
    -- (không có nhịp hiện diện 75 giây gần nhất)
    IF v_conv.kind = 'DIRECT' THEN
        UPDATE chat.member SET left_at = NULL WHERE conversation_id = NEW.conversation_id AND left_at IS NOT NULL;
        FOR v_target IN
            SELECT m.person_id FROM chat.member m
            WHERE m.conversation_id = NEW.conversation_id AND m.person_id <> NEW.sender_id AND m.left_at IS NULL
              AND NOT m.muted
              AND NOT EXISTS (SELECT FROM live.presence p WHERE p.tenant_id = NEW.tenant_id AND p.person_id = m.person_id
                                                          AND p.seen_at > now() - interval '75 seconds')
              -- Một thông báo cho mỗi loạt tin chưa đọc, không dồn mỗi tin một thông báo
              AND NOT EXISTS (SELECT FROM collab.notification n
                              WHERE n.recipient_id = m.person_id AND n.kind = 'CHAT_MESSAGE'
                                AND n.entity_id = NEW.conversation_id AND n.read_at IS NULL)
        LOOP
            PERFORM collab.notify(NEW.tenant_id, v_target, 'CHAT_MESSAGE', 'chat.conversation', NEW.conversation_id,
                                  v_sender || ' gửi tin nhắn cho bạn', v_preview, NEW.sender_id);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER message_after_insert AFTER INSERT ON chat.message
    FOR EACH ROW EXECUTE FUNCTION chat.message_after_insert();

-- Đánh dấu đã đọc chỉ tiến, không lùi
CREATE FUNCTION chat.member_before_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.tenant_id, NEW.conversation_id, NEW.person_id) IS DISTINCT FROM
       (OLD.tenant_id, OLD.conversation_id, OLD.person_id) THEN
        RAISE EXCEPTION 'Không đổi cuộc trò chuyện hoặc thành viên';
    END IF;
    NEW.last_read_id := greatest(OLD.last_read_id, NEW.last_read_id);
    RETURN NEW;
END $$;
CREATE TRIGGER member_before_update BEFORE UPDATE ON chat.member
    FOR EACH ROW EXECUTE FUNCTION chat.member_before_update();

-- Tệp gửi trong cuộc trò chuyện dùng chung kho tệp đính kèm (quét virus, hạn mức): loại chứng từ `chat.conversation`.
-- Bọc hai hàm đọc chứng từ chung thay vì chép lại toàn bộ thân hàm.
ALTER FUNCTION collab.entity_tenant(text, uuid) RENAME TO entity_tenant_base;
CREATE FUNCTION collab.entity_tenant(p_type text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'chat.conversation' THEN
        RETURN (SELECT tenant_id FROM chat.conversation WHERE id = p_id);
    END IF;
    RETURN collab.entity_tenant_base(p_type, p_id);
END $$;

ALTER FUNCTION wf.entity_can_read(text, uuid, uuid, timestamptz) RENAME TO entity_can_read_base;
CREATE FUNCTION wf.entity_can_read(p_type text, p_id uuid, p_person uuid, p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
    IF p_type = 'chat.conversation' THEN
        RETURN p_person IS NOT NULL AND chat.is_member(p_id, p_person);
    END IF;
    RETURN wf.entity_can_read_base(p_type, p_id, p_person, p_at);
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Lịch công tác. Sự kiện cá nhân (người tổ chức + người được mời thấy) hoặc lịch của đơn vị (mọi người trong cây con của
-- đơn vị thấy, ví dụ lịch công tác tuần của Ban giám đốc). Lặp theo ngày/tuần/tháng đến một ngày cuối; giờ lưu UTC, giao
-- diện hiển thị theo múi giờ Asia/Ho_Chi_Minh.
CREATE TABLE cal.event (
    tenant_id         uuid NOT NULL REFERENCES core.tenant,
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    description       text CHECK (length(description) <= 4000),
    location          text CHECK (length(location) <= 200),
    kind              text NOT NULL DEFAULT 'MEETING'
                      CHECK (kind IN ('MEETING', 'WORK', 'TRIP', 'LEAVE', 'DEADLINE', 'OTHER')),
    starts_at         timestamptz NOT NULL,
    ends_at           timestamptz NOT NULL,
    all_day           boolean NOT NULL DEFAULT false,
    recurrence        text NOT NULL DEFAULT 'NONE' CHECK (recurrence IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY')),
    recur_until       date,
    scope             text NOT NULL DEFAULT 'PERSONAL' CHECK (scope IN ('PERSONAL', 'UNIT')),
    org_unit_id       uuid,
    organizer_id      uuid NOT NULL,
    reminder_minutes  int CHECK (reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 10080),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    cancelled_at      timestamptz,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, org_unit_id) REFERENCES core.org_unit (tenant_id, id),
    FOREIGN KEY (tenant_id, organizer_id) REFERENCES core.person (tenant_id, id),
    CHECK (ends_at >= starts_at AND ends_at <= starts_at + interval '62 days'),
    CHECK ((scope = 'UNIT') = (org_unit_id IS NOT NULL)),
    CHECK ((recurrence = 'NONE') = (recur_until IS NULL)),
    CHECK (recur_until IS NULL OR recur_until <= (starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 731)
);
CREATE INDEX event_range ON cal.event (tenant_id, starts_at, ends_at);
CREATE INDEX event_unit ON cal.event (tenant_id, org_unit_id) WHERE scope = 'UNIT';
CALL audit.enable('cal.event');

CREATE TABLE cal.attendee (
    tenant_id     uuid NOT NULL,
    event_id      uuid NOT NULL,
    person_id     uuid NOT NULL,
    response      text NOT NULL DEFAULT 'PENDING' CHECK (response IN ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE')),
    responded_at  timestamptz,
    PRIMARY KEY (event_id, person_id),
    FOREIGN KEY (tenant_id, event_id) REFERENCES cal.event (tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, person_id) REFERENCES core.person (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX attendee_person ON cal.attendee (tenant_id, person_id);

-- Nhắc lịch đã gửi cho từng lần diễn ra (sự kiện lặp có nhiều lần)
CREATE TABLE cal.reminder_sent (
    event_id    uuid NOT NULL REFERENCES cal.event ON DELETE CASCADE,
    person_id   uuid NOT NULL,
    occurs_at   timestamptz NOT NULL,
    sent_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, person_id, occurs_at)
);

CREATE FUNCTION cal.event_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.all_day THEN
        -- Cả ngày: từ 00:00 ngày đầu đến 00:00 sau ngày cuối, giờ Việt Nam
        NEW.starts_at := date_trunc('day', NEW.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
        -- Ngày cuối tính cả ngày chứa thời điểm kết thúc (00:00 đúng thì là ngày trước đó)
        NEW.ends_at := greatest(
            (date_trunc('day', (NEW.ends_at - interval '1 microsecond') AT TIME ZONE 'Asia/Ho_Chi_Minh')
                + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh',
            NEW.starts_at + interval '1 day');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER event_touch BEFORE INSERT OR UPDATE ON cal.event FOR EACH ROW EXECUTE FUNCTION cal.event_touch();

-- Người xem được sự kiện: người tổ chức, người được mời, hoặc người trong cây con của đơn vị (lịch đơn vị)
CREATE FUNCTION cal.can_read(p_event uuid, p_person uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT FROM cal.event e
        WHERE e.id = p_event AND (
            e.organizer_id = p_person
            OR EXISTS (SELECT FROM cal.attendee a WHERE a.event_id = e.id AND a.person_id = p_person)
            OR (e.scope = 'UNIT' AND EXISTS (
                SELECT FROM core.org_unit u
                JOIN core.org_unit d ON d.tenant_id = u.tenant_id AND d.path <@ u.path
                JOIN core.position p ON p.tenant_id = d.tenant_id AND p.org_unit_id = d.id AND p.valid_period @> now()
                JOIN core.assignment a ON a.position_id = p.id AND a.valid_period @> now()
                WHERE u.id = e.org_unit_id AND a.person_id = p_person))))
$$;

CREATE FUNCTION cal.event_can_read(p_row cal.event, hasura_session json) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT cal.can_read(p_row.id, core.session_person(hasura_session)) $$;

-- Các lần diễn ra của một sự kiện giao với khoảng [p_from, p_to)
CREATE FUNCTION cal.occurrences(p_event cal.event, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (occurs_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE AS $$
    WITH steps AS (
        SELECT CASE p_event.recurrence
                   WHEN 'DAILY' THEN interval '1 day'
                   WHEN 'WEEKLY' THEN interval '1 week'
                   WHEN 'MONTHLY' THEN interval '1 month'
               END AS step,
               p_event.ends_at - p_event.starts_at AS length,
               (p_event.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS local_start
    ), series AS (
        SELECT (s.local_start + n * s.step) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS occurs_at, s.length
        FROM steps s, generate_series(0, 800) n
        WHERE s.step IS NOT NULL
          AND (s.local_start + n * s.step)::date <= p_event.recur_until
        UNION ALL
        SELECT p_event.starts_at, s.length FROM steps s WHERE s.step IS NULL
    )
    SELECT occurs_at, occurs_at + length FROM series
    WHERE occurs_at < p_to AND occurs_at + length > p_from
$$;

-- Gửi nhắc lịch cho các lần diễn ra sắp tới (flow-sync gọi mỗi phút). Trả số nhắc đã gửi.
CREATE FUNCTION cal.send_reminders() RETURNS integer
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
    DELETE FROM cal.reminder_sent WHERE occurs_at < now() - interval '30 days';
    RETURN v_count;
END $$;

-- Thay đổi lịch và tin nhắn báo cho trình duyệt đang mở (ADR #64)
CALL live.track('cal.event', 'calendar');
CALL live.track('cal.attendee', 'calendar');

-- Kênh đơn vị cho các công ty hiện có
SELECT chat.sync_all();

-- Ai được đặt lịch của đơn vị: trưởng đơn vị đó hoặc đơn vị cấp trên, hoặc người được giao quyền cal.unit.manage
INSERT INTO core.permission (code, description) VALUES
    ('cal.unit.manage', 'Đặt, sửa lịch công tác chung của đơn vị');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT DISTINCT tenant_id, role_id, 'cal.unit.manage'
FROM core.role_permission
WHERE permission_code = 'core.org.manage';

CREATE FUNCTION cal.can_manage_unit(p_person uuid, p_unit uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT core.has_permission(p_person, 'cal.unit.manage', p_unit) OR EXISTS (
        SELECT FROM core.org_unit u
        JOIN core.org_unit h ON h.tenant_id = u.tenant_id AND u.path <@ h.path
        JOIN core.position p ON p.tenant_id = h.tenant_id AND p.org_unit_id = h.id AND p.is_head
                             AND p.valid_period @> now()
        JOIN core.assignment a ON a.position_id = p.id AND a.valid_period @> now()
        WHERE u.id = p_unit AND a.person_id = p_person)
$$;
