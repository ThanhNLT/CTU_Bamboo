-- Bamboo - DX-OS Open-Core
-- @version 0.5.0
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

SELECT test.put('ABC', tenant_id), test.put('ABC_GD', director_position_id), test.put('ABC_QT', admin_position_id),
       test.put('ABC_ROOT', root_unit_id)
FROM core.create_tenant('ABC', 'Công ty ABC');
SELECT test.put('chu', core.place_person(test.id('ABC'), 'sub-chu', 'Chủ sở hữu', 'ABC-0001', test.id('ABC_GD')));
SELECT test.put('qt', core.place_person(test.id('ABC'), 'sub-qt', 'Trần Bình', 'ABC-0002', test.id('ABC_QT')));
INSERT INTO core.position (tenant_id, id, org_unit_id, name)
VALUES (test.id('ABC'), test.put('ABC_NV', gen_random_uuid()), test.id('ABC_ROOT'), 'Nhân viên');
SELECT test.put('nv', core.place_person(test.id('ABC'), 'sub-nv', 'Nhân viên', 'ABC-0003', test.id('ABC_NV')));

SELECT test.ok(NOT core.record_login(test.id('ABC'), test.id('qt'), sha256('may-1'), 'Firefox', '10.0.0.0'),
               'chưa có chủ sở hữu thì bỏ qua');
INSERT INTO core.tenant_owner (tenant_id, person_id) VALUES (test.id('ABC'), test.id('chu'));

SELECT test.ok(core.record_login(test.id('ABC'), test.id('qt'), sha256('may-1'), 'Firefox 140 trên Windows', '203.0.113.0'),
               'quản trị viên đăng nhập máy mới thì báo');
SELECT test.eq((SELECT count(*)::int FROM collab.notification
                WHERE recipient_id = test.id('chu') AND kind = 'SECURITY' AND title LIKE '%Trần Bình%'), 1,
               'chủ sở hữu nhận cảnh báo');
SELECT test.ok(NOT core.record_login(test.id('ABC'), test.id('qt'), sha256('may-1'), 'Firefox 140 trên Windows', '203.0.113.0'),
               'thiết bị đã biết thì không báo lại');
SELECT test.ok(NOT core.record_login(test.id('ABC'), test.id('nv'), sha256('may-2'), 'Chrome', '203.0.113.0'),
               'người thường không bị theo dõi');
SELECT test.eq((SELECT count(*)::int FROM core.login_device WHERE person_id = test.id('nv')), 0, 'không lưu thiết bị người thường');
SELECT test.ok(core.record_login(test.id('ABC'), test.id('chu'), sha256('may-3'), 'Safari', '198.51.100.0'),
               'chủ sở hữu đăng nhập máy mới cũng được báo');

SELECT core.notify_security(test.id('ABC'), 'Đã chuyển quyền chủ sở hữu', 'thử');
SELECT test.eq((SELECT count(DISTINCT recipient_id)::int FROM collab.notification
                WHERE tenant_id = test.id('ABC') AND title = 'Đã chuyển quyền chủ sở hữu'), 2,
               'chủ sở hữu và quản trị viên nhận tin');

INSERT INTO core.setup_application (purpose, tenant_id, token_sha256, nonce, data, pdf, expires_at)
VALUES ('RECOVER', test.id('ABC'), sha256('t'), 'N-1', '{}', '\x00', now() + interval '1 hour');
SELECT test.throws($$INSERT INTO core.setup_application (purpose, token_sha256, nonce, data, pdf, expires_at)
                     VALUES ('RECOVER', sha256('t'), 'N-2', '{}', '\x00', now())$$, '%setup_application_check%',
                   'đơn khôi phục phải gắn công ty');
