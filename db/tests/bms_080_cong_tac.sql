-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Thông báo tự sinh (giao việc, ủy quyền, kết quả đề nghị, bình luận) và kiểm tra bình luận.
SELECT test.fixture();

CREATE FUNCTION pg_temp.notes(p_person text, p_kind text) RETURNS bigint
LANGUAGE sql AS $$ SELECT count(*) FROM collab.notification WHERE recipient_id = test.id(p_person) AND kind = p_kind $$;

-- Gửi duyệt: người nhận việc được báo; người được ủy quyền cũng được báo.
INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period)
VALUES (test.id('TDX'), test.id('tp_mh_dt'), test.id('d'), test.id('P_TP_MH_DT'),
        tstzrange(now() - interval '1 day', now() + interval '1 day'));
SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.eq(pg_temp.notes('tp_mh_dt', 'TASK_ASSIGNED'), 1::bigint, 'Người nhận việc được báo');
SELECT test.eq(pg_temp.notes('d', 'TASK_ASSIGNED'), 1::bigint, 'Người được ủy quyền được báo');
SELECT test.ok((SELECT title FROM collab.notification WHERE recipient_id = test.id('tp_mh_dt'))
               LIKE 'Việc cần duyệt: PR-%pr', 'Tiêu đề có số và tên chứng từ');

-- Trả về: người lập được báo kèm lý do, người gây ra sự kiện là người duyệt.
SELECT wf.act((test.open_task('pr')).id, test.id('tp_mh_dt'), 'RETURN', 'Thiếu báo giá');
SELECT test.eq((SELECT body || '|' || test.key(actor_id) FROM collab.notification
                WHERE recipient_id = test.id('c') AND kind = 'REQUEST_RETURNED'),
               'Thiếu báo giá|tp_mh_dt', 'Bị trả về: báo người lập kèm lý do');

-- Gửi lại và duyệt thay: người lập được báo đã duyệt.
SELECT proc.submit_purchase_request(test.id('pr'), test.id('c'));
SELECT wf.act((test.open_task('pr')).id, test.id('d'), 'APPROVE');
SELECT test.eq(pg_temp.notes('c', 'REQUEST_APPROVED'), 1::bigint, 'Đã duyệt: báo người lập');
SELECT test.eq(pg_temp.notes('d', 'REQUEST_APPROVED'), 0::bigint, 'Người duyệt không tự nhận thông báo kết quả');

-- Bình luận: người lập (chủ chứng từ) được báo; nhắc tên thì người được nhắc được báo.
INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body, mentions)
VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), test.id('tp_mh_dt'), 'Nhờ chị C bổ sung hóa đơn',
        ARRAY[test.id('d'), test.id('d')]);
SELECT test.eq(pg_temp.notes('c', 'COMMENT'), 1::bigint, 'Chủ chứng từ được báo có bình luận');
SELECT test.eq(pg_temp.notes('d', 'MENTION'), 1::bigint, 'Người được nhắc tên được báo một lần');
SELECT test.eq((SELECT cardinality(mentions) FROM collab.comment WHERE author_id = test.id('tp_mh_dt')), 1,
               'Bỏ trùng người được nhắc tên');

-- Trả lời: người viết bình luận gốc được báo.
INSERT INTO collab.comment (tenant_id, entity_type, entity_id, parent_id, author_id, body)
SELECT tenant_id, entity_type, entity_id, id, test.id('c'), 'Em đã bổ sung' FROM collab.comment
WHERE author_id = test.id('tp_mh_dt');
SELECT test.eq(pg_temp.notes('tp_mh_dt', 'COMMENT'), 1::bigint, 'Người viết bình luận gốc được báo khi có trả lời');
SELECT test.eq(pg_temp.notes('c', 'COMMENT'), 1::bigint, 'Người tự trả lời không tự nhận thông báo');

-- Kiểm tra bình luận.
SELECT test.throws($$INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                     VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), test.id('a'), 'Xin chào')$$,
                   '%Không có quyền xem%', 'Người không xem được chứng từ thì không bình luận được');
SELECT test.throws($$INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body, mentions)
                     VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), test.id('c'), 'Xem giúp', ARRAY[test.id('a')])$$,
                   '%không xem được chứng từ%', 'Không nhắc tên người không xem được chứng từ');
SELECT test.throws($$INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                     VALUES (test.id('BVX'), 'proc.purchase_request', test.id('pr'), test.id('c'), 'x')$$,
                   '%Không tìm thấy chứng từ%', 'Chứng từ phải cùng tenant');
SELECT test.throws($$INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                     VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), test.id('c'), '  ')$$,
                   '%violates check%', 'Không bình luận rỗng');
SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('c'))::text, true);
SELECT test.throws($$INSERT INTO collab.comment (tenant_id, entity_type, entity_id, author_id, body)
                     VALUES (test.id('TDX'), 'proc.purchase_request', test.id('pr'), test.id('tp_mh_dt'), 'x')$$,
                   '%người đang đăng nhập%', 'Không bình luận thay người khác qua Hasura');
SELECT set_config('hasura.user', '', true);

-- Sửa và xóa mềm.
UPDATE collab.comment SET body = 'Em đã bổ sung hóa đơn' WHERE author_id = test.id('c');
SELECT test.ok((SELECT edited_at IS NOT NULL FROM collab.comment WHERE author_id = test.id('c')), 'Sửa thì ghi edited_at');
SELECT test.throws($$UPDATE collab.comment SET parent_id = NULL WHERE author_id = test.id('c')$$,
                   '%Chỉ sửa được nội dung%', 'Không chuyển bình luận sang luồng khác');
UPDATE collab.comment SET deleted_at = '2000-01-01' WHERE author_id = test.id('c');
SELECT test.eq((SELECT body || '|' || (deleted_at > now() - interval '1 minute') FROM collab.comment
                WHERE author_id = test.id('c')), '|true', 'Xóa mềm: xóa nội dung, giờ xóa là giờ hiện tại');
SELECT test.throws($$UPDATE collab.comment SET body = 'lại' WHERE author_id = test.id('c')$$,
                   '%đã xóa%', 'Không sửa bình luận đã xóa');

-- Đánh dấu đã đọc: chỉ thông báo của người gọi.
SELECT test.eq((SELECT count(*) FROM collab.mark_notifications_read(
                    json_build_object('x-hasura-user-id', test.id('c'), 'x-hasura-tenant-id', test.id('TDX')), NULL)),
               (SELECT count(*) FROM collab.notification WHERE recipient_id = test.id('c')), 'Đánh dấu tất cả của mình');
SELECT test.eq((SELECT count(*) FROM collab.notification WHERE recipient_id <> test.id('c') AND read_at IS NOT NULL),
               0::bigint, 'Không đụng thông báo người khác');
SELECT test.eq((SELECT count(*) FROM collab.mark_notifications_read(
                    json_build_object('x-hasura-user-id', test.id('d'), 'x-hasura-tenant-id', test.id('BVX')), NULL)),
               0::bigint, 'Phiên tenant khác không đánh dấu được');

-- Người lập tự hủy thì không tự báo mình; hệ thống hủy (hết hợp đồng) thì người lập được báo.
SELECT test.pr('pr2', 'c', 'P_NV_MH_DT', 1000);
SELECT proc.cancel_purchase_request(test.id('pr2'), test.id('c'), 'Không cần nữa');
SELECT test.eq(pg_temp.notes('c', 'REQUEST_CANCELLED'), 0::bigint, 'Tự hủy thì không tự báo mình');
SELECT test.pr('pr3', 'c', 'P_NV_MH_DT', 1000);
SELECT wf.cancel_entity('proc.purchase_request', test.id('pr3'), 'Hết hạn hợp đồng của người lập');
SELECT test.eq(pg_temp.notes('c', 'REQUEST_CANCELLED'), 1::bigint, 'Hệ thống hủy thì báo người lập');
