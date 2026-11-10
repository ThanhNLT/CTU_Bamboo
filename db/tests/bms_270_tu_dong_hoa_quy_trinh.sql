-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

INSERT INTO wf.process_model (tenant_id, id, process_key, name, bpmn_xml, created_by, owner_unit_id)
VALUES (test.id('TDX'), test.put('MA', gen_random_uuid()), 'tu_dong', 'Nhắc việc định kỳ', '<x/>',
        test.id('tp_mh_dt'), test.id('DT_MH'));
INSERT INTO wf.process_automation (tenant_id, id, model_id, version, flowable_deployment_id, flowable_definition_id,
                                   definition_key, actions, activated_by)
VALUES (test.id('TDX'), test.put('AU', gen_random_uuid()), test.id('MA'), 1, 'dep', 'def:1:x', 'auto_x_tu_dong',
        '{"n1": {"action": "notify", "audience": "UNIT", "message": "Nhớ cập nhật tiến độ"},
          "n2": {"action": "notify", "audience": "INITIATOR", "message": "Đã gửi nhắc việc"},
          "n3": {"action": "notify", "audience": "GROUP", "message": "Thông báo toàn tập đoàn"},
          "n4": {"action": "khac"}}', test.id('tp_mh_dt'));
INSERT INTO wf.automation_run (tenant_id, id, automation_id, flowable_instance_id, trigger, started_by)
VALUES (test.id('TDX'), test.put('RUN', gen_random_uuid()), test.id('AU'), 'inst-1', 'MANUAL', test.id('c'));

SELECT test.throws($$ INSERT INTO wf.process_automation (tenant_id, model_id, version, flowable_deployment_id,
                         flowable_definition_id, definition_key, activated_by)
                     VALUES (test.id('TDX'), test.id('MA'), 2, 'd2', 'f2', 'k2', test.id('tp_mh_dt')) $$,
                   '%one_active%', 'một quy trình chỉ có một bản chạy tự động hiệu lực');

SELECT test.eq(wf.automation_notify(test.id('RUN'), 'n1'),
               (SELECT count(*)::int FROM wf.people_under(test.id('DT_MH')) x), 'báo cho mọi người trong phòng');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('c') AND kind = 'PROCESS_AUTOMATION'),
               1, 'nhân viên trong phòng nhận thông báo tự động');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('gd_chip') AND kind = 'PROCESS_AUTOMATION'),
               0, 'người ngoài phạm vi không nhận');

SELECT test.eq(wf.automation_notify(test.id('RUN'), 'n2'), 1, 'báo riêng cho người khởi chạy');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('c') AND title LIKE '%Đã gửi nhắc việc'),
               1, 'người khởi chạy nhận đúng nội dung');

INSERT INTO wf.automation_run (tenant_id, id, automation_id, flowable_instance_id, trigger)
VALUES (test.id('TDX'), test.put('RUN2', gen_random_uuid()), test.id('AU'), 'inst-2', 'TIMER');
SELECT test.eq(wf.automation_notify(test.id('RUN2'), 'n2'), 1, 'hẹn giờ: báo cho người bật tự động');
SELECT test.eq((SELECT count(*)::int FROM collab.notification WHERE recipient_id = test.id('tp_mh_dt') AND title LIKE '%Đã gửi nhắc việc'),
               1, 'trưởng phòng nhận');

SELECT test.ok(wf.automation_notify(test.id('RUN'), 'n3') > 5, 'toàn tập đoàn báo nhiều người');
SELECT test.throws($$ SELECT wf.automation_notify(test.id('RUN'), 'n4') $$, '%không có hành động gửi thông báo%',
                   'hành động lạ bị từ chối');
SELECT test.throws($$ SELECT wf.automation_notify(test.id('RUN'), 'khong-co') $$, '%không có hành động%', 'phần tử không có');
SELECT test.throws($$ UPDATE wf.process_automation SET status = 'STOPPED' $$, '%check%', 'dừng phải có thời điểm dừng');
