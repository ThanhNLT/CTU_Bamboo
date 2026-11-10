-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

SELECT test.put('M1', msg.enqueue(test.id('TDX'), 'notify.email', '{"to": "a@x.vn", "n": 1}', 'k1', test.id('c')));
SELECT test.eq(msg.enqueue(test.id('TDX'), 'notify.email', '{"to": "khac@x.vn"}', 'k1'), test.id('M1'), 'trùng khóa thì trả tin cũ');
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE tenant_id = test.id('TDX')), 1, 'không sinh tin trùng');
SELECT test.eq((SELECT payload_sha256 FROM msg.queue WHERE id = test.id('M1')),
               encode(sha256(convert_to('{"n": 1, "to": "a@x.vn"}', 'UTF8')), 'hex'), 'mã băm nội dung tính tại CSDL');
SELECT test.throws($$UPDATE msg.queue SET payload = '{"to": "sua@x.vn"}' WHERE id = test.id('M1')$$, '%Không sửa nội dung%', 'không sửa nội dung');
SELECT test.throws($$UPDATE msg.queue SET payload_sha256 = 'x' WHERE id = test.id('M1')$$, '%Không sửa nội dung%', 'không sửa mã băm');

SELECT msg.enqueue(test.id('TDX'), 'notify.sms', '{"to": "+84900000000"}', 'k2', NULL, 5, interval '1 hour');
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.sms', 'w1')), 0, 'chưa đến hạn chưa nhận được');
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.email', 'w1')), 1, 'nhận được tin email đến hạn');
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.email', 'w2')), 0, 'tin đang giữ không giao cho worker khác');
SELECT test.eq((SELECT status || attempts FROM msg.queue WHERE id = test.id('M1')), 'LEASED1', 'đang giữ, lần thử 1');

SELECT test.eq(msg.fail(test.id('M1'), 'SMTP từ chối'), 'PENDING', 'lỗi thì chờ thử lại');
SELECT test.ok((SELECT next_attempt_at > now() + interval '20 seconds' AND next_attempt_at < now() + interval '40 seconds'
                FROM msg.queue WHERE id = test.id('M1')), 'lần 1 chờ khoảng 30 giây');
UPDATE msg.queue SET next_attempt_at = now() WHERE id = test.id('M1');
SELECT count(*) FROM msg.lease('notify.email', 'w1');
SELECT msg.fail(test.id('M1'), 'lỗi 2');
SELECT test.ok((SELECT next_attempt_at > now() + interval '50 seconds' AND next_attempt_at < now() + interval '70 seconds'
                FROM msg.queue WHERE id = test.id('M1')), 'lần 2 chờ khoảng 60 giây');
UPDATE msg.queue SET next_attempt_at = now(), max_attempts = 4 WHERE id = test.id('M1');
SELECT count(*) FROM msg.lease('notify.email', 'w1');
SELECT msg.fail(test.id('M1'), 'lỗi 3');
UPDATE msg.queue SET next_attempt_at = now() WHERE id = test.id('M1');
SELECT count(*) FROM msg.lease('notify.email', 'w1');
SELECT test.eq(msg.fail(test.id('M1'), 'lỗi 4'), 'DEAD', 'hết lượt thì vào hàng chết');
SELECT test.eq((SELECT count(*)::int FROM msg.attempt WHERE message_id = test.id('M1') AND NOT ok), 4, 'ghi lại từng lần thử');
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.email', 'w1')), 0, 'hàng chết không tự nhận lại');

SELECT msg.retry(test.id('M1'));
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.email', 'w1')), 1, 'đưa lại thì nhận được');
SELECT test.throws($$SELECT msg.complete(test.id('M1'), NULL)$$, '%check%', 'giao rồi phải có biên nhận');
SELECT msg.complete(test.id('M1'), '{"provider_id": "<id@mail>", "sig": "abc"}');
SELECT test.eq((SELECT status FROM msg.queue WHERE id = test.id('M1')), 'DELIVERED', 'đã giao');
SELECT test.throws($$SELECT msg.retry(test.id('M1'))$$, '%hàng chết%', 'tin đã giao không đưa lại');
SELECT test.throws($$UPDATE msg.queue SET status = 'PENDING' WHERE id = test.id('M1')$$, '%đã giao%', 'tin đã giao không đổi');

SELECT msg.enqueue(test.id('TDX'), 'notify.webhook', '{"url": "https://x.vn"}', 'k3');
SELECT count(*) FROM msg.lease('notify.webhook', 'w1');
UPDATE msg.queue SET leased_until = now() - interval '1 second' WHERE idempotency_key = 'k3';
SELECT test.eq((SELECT count(*)::int FROM msg.lease('notify.webhook', 'w2')), 1, 'worker chết thì tin được nhận lại');

INSERT INTO collab.notification_pref (tenant_id, person_id, channel, address)
VALUES (test.id('TDX'), test.id('c'), 'EMAIL', 'c@bamboo.vn'),
       (test.id('TDX'), test.id('c'), 'SMS', '+84901234567');
INSERT INTO collab.notification_pref (tenant_id, person_id, channel, address, kinds)
VALUES (test.id('TDX'), test.id('d'), 'EMAIL', 'd@bamboo.vn', ARRAY['TASK_ASSIGNED']);
SELECT test.throws($$INSERT INTO collab.notification_pref (tenant_id, person_id, channel, address) VALUES (test.id('TDX'), test.id('a'), 'EMAIL', 'khong-phai-email')$$,
                   '%check%', 'email sai định dạng');
SELECT test.throws($$INSERT INTO collab.notification_pref (tenant_id, person_id, channel, address) VALUES (test.id('TDX'), test.id('a'), 'WEBHOOK', 'http://khong-bao-mat.vn')$$,
                   '%check%', 'webhook phải dùng https');

SELECT collab.notify(test.id('TDX'), test.id('c'), 'COMMENT', 'proc.purchase_request', gen_random_uuid(), 'Có bình luận mới', 'Nội dung', test.id('a'));
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE payload ->> 'recipient_id' = test.id('c')::text), 2, 'người bật email và SMS nhận hai tin');
SELECT test.eq((SELECT payload ->> 'address' FROM msg.queue WHERE topic = 'notify.email' AND payload ->> 'recipient_id' = test.id('c')::text),
               'c@bamboo.vn', 'tin email gửi đúng địa chỉ');
SELECT collab.notify(test.id('TDX'), test.id('d'), 'COMMENT', 'proc.purchase_request', gen_random_uuid(), 'Bình luận', NULL, test.id('a'));
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE payload ->> 'recipient_id' = test.id('d')::text), 0, 'lọc theo loại thông báo đã chọn');
SELECT collab.notify(test.id('TDX'), test.id('d'), 'TASK_ASSIGNED', 'wf.task', gen_random_uuid(), 'Có việc mới', NULL, test.id('a'));
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE payload ->> 'recipient_id' = test.id('d')::text), 1, 'đúng loại thì nhận');
UPDATE collab.notification_pref SET enabled = false WHERE person_id = test.id('c') AND channel = 'SMS';
SELECT collab.notify(test.id('TDX'), test.id('c'), 'COMMENT', 'proc.purchase_request', gen_random_uuid(), 'Bình luận 2', NULL, test.id('a'));
SELECT test.eq((SELECT count(*)::int FROM msg.queue WHERE payload ->> 'recipient_id' = test.id('c')::text AND payload ->> 'title' = 'Bình luận 2'),
               1, 'kênh đã tắt thì không sinh tin');
