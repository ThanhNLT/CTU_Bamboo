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

SELECT test.fixture();

SELECT test.ok(EXISTS (SELECT FROM chat.conversation WHERE org_unit_id = test.id('DT_MH') AND kind = 'UNIT'),
               'phòng có kênh riêng');
SELECT test.eq((SELECT array_agg(test.key(person_id) ORDER BY test.key(person_id)) FROM chat.member m
                JOIN chat.conversation c ON c.id = m.conversation_id
                WHERE c.org_unit_id = test.id('DT_MH') AND m.left_at IS NULL),
               ARRAY['c', 'd', 'tp_mh_dt'], 'kênh Phòng Mua hàng gồm trưởng phòng và hai chuyên viên');
SELECT test.ok((SELECT chat.is_member(c.id, test.id('c')) FROM chat.conversation c WHERE c.org_unit_id = test.id('DT')),
               'người ở phòng con thuộc kênh công ty');
SELECT test.ok(NOT (SELECT chat.is_member(c.id, test.id('a')) FROM chat.conversation c WHERE c.org_unit_id = test.id('DT_MH')),
               'người phòng khác không thuộc kênh');

SELECT test.end_assignment('d', 'P_NV2_MH_DT');
SELECT test.ok(NOT (SELECT chat.is_member(c.id, test.id('d')) FROM chat.conversation c WHERE c.org_unit_id = test.id('DT_MH')),
               'hết phân công thì rời kênh');
SELECT test.position('TDX', 'P_NV2_KD_CHIP', 'CHIP_KD', 'Chuyên viên kinh doanh 2');
SELECT test.assign('TDX', 'd', 'P_NV2_KD_CHIP', 'CONCURRENT');
SELECT test.ok((SELECT chat.is_member(c.id, test.id('d')) FROM chat.conversation c WHERE c.org_unit_id = test.id('CHIP_KD')),
               'phân công mới thì vào kênh của phòng mới');

DO $$
DECLARE
    v_conv uuid;
    v_msg  bigint;
BEGIN
    SELECT id INTO v_conv FROM chat.conversation WHERE org_unit_id = test.id('DT_MH');
    PERFORM test.put('KENH_MH', v_conv);
    INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body, mentions)
    VALUES (test.id('TDX'), v_conv, test.id('c'), 'Chào phòng, @trưởng phòng xem giúp',
            ARRAY[test.id('tp_mh_dt'), test.id('a'), test.id('c')])
    RETURNING id INTO v_msg;
    PERFORM test.eq((SELECT mentions FROM chat.message WHERE id = v_msg), ARRAY[test.id('tp_mh_dt')],
                    'chỉ giữ người được nhắc là thành viên, bỏ chính mình');
    PERFORM test.ok(EXISTS (SELECT FROM collab.notification WHERE recipient_id = test.id('tp_mh_dt') AND kind = 'MENTION'
                                                             AND entity_id = v_conv), 'người được nhắc nhận thông báo');
    PERFORM test.eq((SELECT last_read_id FROM chat.member WHERE conversation_id = v_conv AND person_id = test.id('c')),
                    v_msg, 'người gửi coi như đã đọc tin của mình');
    PERFORM test.eq((SELECT chat.conversation_unread(c, json_build_object('x-hasura-user-id', test.id('tp_mh_dt')))
                     FROM chat.conversation c WHERE id = v_conv), 1, 'trưởng phòng có một tin chưa đọc');
    PERFORM test.ok((SELECT last_preview FROM chat.conversation WHERE id = v_conv) LIKE 'Chào phòng%',
                    'cuộc trò chuyện giữ dòng xem trước');
    UPDATE chat.member SET last_read_id = v_msg WHERE conversation_id = v_conv AND person_id = test.id('tp_mh_dt');
    UPDATE chat.member SET last_read_id = 0 WHERE conversation_id = v_conv AND person_id = test.id('tp_mh_dt');
    PERFORM test.eq((SELECT last_read_id FROM chat.member WHERE conversation_id = v_conv AND person_id = test.id('tp_mh_dt')),
                    v_msg, 'đánh dấu đã đọc không lùi');

    UPDATE chat.message SET body = 'Chào cả phòng' WHERE id = v_msg;
    PERFORM test.ok((SELECT edited_at IS NOT NULL FROM chat.message WHERE id = v_msg), 'sửa tin ghi thời điểm sửa');
    UPDATE chat.message SET deleted_at = now() WHERE id = v_msg;
    PERFORM test.eq((SELECT body FROM chat.message WHERE id = v_msg), '', 'thu hồi xóa nội dung');
    PERFORM test.throws(format('UPDATE chat.message SET body = %L WHERE id = %s', 'x', v_msg), '%thu hồi%',
                        'không sửa tin đã thu hồi');
END $$;

SELECT test.throws($$ INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body)
                      VALUES (test.id('TDX'), test.id('KENH_MH'), test.id('a'), 'xin chào') $$,
                   '%không ở trong cuộc trò chuyện%', 'người ngoài không gửi được');
SELECT test.throws($$ INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body)
                      VALUES (test.id('TDX'), test.id('KENH_MH'), test.id('c'), '   ') $$,
                   '%check%', 'không gửi tin rỗng');

INSERT INTO chat.conversation (tenant_id, kind, direct_key, created_by)
VALUES (test.id('TDX'), 'DIRECT', least(test.id('c')::text, test.id('a')::text) || ':' ||
                                  greatest(test.id('c')::text, test.id('a')::text), test.id('c'));
INSERT INTO chat.member (tenant_id, conversation_id, person_id)
SELECT test.id('TDX'), c.id, x FROM chat.conversation c, unnest(ARRAY[test.id('c'), test.id('a')]) x
WHERE c.kind = 'DIRECT' AND c.created_by = test.id('c');
INSERT INTO chat.message (tenant_id, conversation_id, sender_id, body)
SELECT test.id('TDX'), id, test.id('c'), m FROM chat.conversation, unnest(ARRAY['một', 'hai', 'ba']) m
WHERE kind = 'DIRECT' AND created_by = test.id('c');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('a') AND kind = 'CHAT_MESSAGE'),
               1, 'một thông báo cho loạt tin chưa đọc');
SELECT test.eq((SELECT chat.conversation_display_name(c, json_build_object('x-hasura-user-id', test.id('a')))
                FROM chat.conversation c WHERE kind = 'DIRECT' AND created_by = test.id('c')),
               'Chị C', 'cuộc hai người hiện tên người kia');
SELECT test.ok((SELECT wf.entity_can_read('chat.conversation', c.id, test.id('a')) AND
                       NOT wf.entity_can_read('chat.conversation', c.id, test.id('d'))
                FROM chat.conversation c WHERE kind = 'DIRECT' AND created_by = test.id('c')),
               'tệp trong cuộc trò chuyện chỉ thành viên đọc được');
SELECT test.ok(wf.entity_can_read('proc.purchase_request', gen_random_uuid(), test.id('a')) IS FALSE,
               'các loại chứng từ cũ vẫn đi qua hàm gốc');
SELECT test.eq((SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'bms_cdc' AND schemaname IN ('chat', 'cal')),
               0, 'chat, cal không vào CDC');

INSERT INTO cal.event (tenant_id, id, title, starts_at, ends_at, scope, org_unit_id, organizer_id)
VALUES (test.id('TDX'), test.put('EV_DT', gen_random_uuid()), 'Giao ban Điện thoại X', now() + interval '1 day',
        now() + interval '1 day 1 hour', 'UNIT', test.id('DT'), test.id('gd_dt'));
SELECT test.ok(cal.can_read(test.id('EV_DT'), test.id('c')), 'chuyên viên phòng con thấy lịch công ty');
SELECT test.ok(NOT cal.can_read(test.id('EV_DT'), test.id('a')), 'công ty khác trong tập đoàn không thấy');

INSERT INTO cal.event (tenant_id, id, title, starts_at, ends_at, organizer_id, recurrence, recur_until, reminder_minutes)
VALUES (test.id('TDX'), test.put('EV_TUAN', gen_random_uuid()), 'Họp tuần', now() + interval '5 minutes',
        now() + interval '65 minutes', test.id('c'), 'WEEKLY', (now() + interval '29 days')::date, 10);
INSERT INTO cal.attendee (tenant_id, event_id, person_id) VALUES (test.id('TDX'), test.id('EV_TUAN'), test.id('d'));
SELECT test.ok(cal.can_read(test.id('EV_TUAN'), test.id('d')) AND NOT cal.can_read(test.id('EV_TUAN'), test.id('a')),
               'người được mời thấy, người khác không');
SELECT test.eq((SELECT count(*)::int FROM cal.event e, cal.occurrences(e, now(), now() + interval '60 days') o
                WHERE e.id = test.id('EV_TUAN')), 5, 'họp tuần lặp 5 lần đến hết ngày cuối');
SELECT test.eq(cal.send_reminders(), 2, 'nhắc người tổ chức và người được mời trước 10 phút');
SELECT test.eq(cal.send_reminders(), 0, 'mỗi lần diễn ra chỉ nhắc một lần');
SELECT test.throws($$ INSERT INTO cal.event (tenant_id, title, starts_at, ends_at, organizer_id)
                      VALUES (test.id('TDX'), 'x', now(), now() - interval '1 hour', test.id('c')) $$,
                   '%check%', 'kết thúc trước khi bắt đầu');
SELECT test.throws($$ INSERT INTO cal.event (tenant_id, title, starts_at, ends_at, organizer_id, recurrence)
                      VALUES (test.id('TDX'), 'x', now(), now(), test.id('c'), 'DAILY') $$,
                   '%check%', 'lặp phải có ngày cuối');

INSERT INTO cal.event (tenant_id, id, title, starts_at, ends_at, all_day, organizer_id, kind)
VALUES (test.id('TDX'), test.put('EV_NGHI', gen_random_uuid()), 'Nghỉ phép', '2026-11-10 15:00+07', '2026-11-11 09:00+07',
        true, test.id('c'), 'LEAVE');
SELECT test.eq((SELECT (starts_at, ends_at) FROM cal.event WHERE id = test.id('EV_NGHI')),
               ('2026-11-10 00:00+07'::timestamptz, '2026-11-12 00:00+07'::timestamptz),
               'sự kiện cả ngày phủ trọn ngày đầu đến ngày cuối (giờ Việt Nam)');
