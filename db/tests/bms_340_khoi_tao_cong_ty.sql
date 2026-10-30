-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

SELECT test.fixture();

-- Khung công ty mới: hai vị trí, bốn vai trò, quy tắc duyệt; Giám đốc và Quản trị hệ thống có quyền quản trị
SELECT test.put('ABC', tenant_id), test.put('ABC_ROOT', root_unit_id), test.put('ABC_GD', director_position_id),
       test.put('ABC_QT', admin_position_id)
FROM core.create_tenant('ABC', 'Công ty ABC');
SELECT test.eq((SELECT count(*)::int FROM core.role WHERE tenant_id = test.id('ABC')), 4, 'bốn vai trò');
SELECT test.eq((SELECT count(*)::int FROM wf.approval_rule WHERE tenant_id = test.id('ABC')), 2, 'hai quy tắc duyệt');
SELECT test.ok(core.position_is_admin(test.id('ABC_GD')) AND core.position_is_admin(test.id('ABC_QT')),
               'Giám đốc và Quản trị hệ thống là vị trí quản trị');
SELECT test.throws($$SELECT core.create_tenant('ABC', 'Trùng')$$, '%đã có%', 'không tạo trùng mã');
SELECT test.throws($$SELECT core.create_tenant('abc x', 'Sai mã')$$, '%không hợp lệ%', 'mã công ty sai mẫu');

SELECT test.put('chu', core.place_person(test.id('ABC'), 'sub-chu', 'Chủ sở hữu', 'ABC-0001', test.id('ABC_GD')));
SELECT test.put('qt', core.place_person(test.id('ABC'), 'sub-qt', 'Quản trị viên', 'ABC-0002', test.id('ABC_QT')));
INSERT INTO core.tenant_owner (tenant_id, person_id, platform) VALUES (test.id('ABC'), test.id('chu'), true);
SELECT test.ok(core.has_permission(test.id('chu'), 'core.module.manage', test.id('ABC_ROOT')), 'chủ sở hữu quản trị được');
SELECT test.ok(core.has_permission(test.id('qt'), 'core.permission.manage', test.id('ABC_ROOT')), 'quản trị viên có quyền');

-- Người thường của công ty mới
INSERT INTO core.position (tenant_id, id, org_unit_id, name)
VALUES (test.id('ABC'), test.put('ABC_NV', gen_random_uuid()), test.id('ABC_ROOT'), 'Nhân viên');
SELECT test.put('nv', core.place_person(test.id('ABC'), 'sub-nv', 'Nhân viên', 'ABC-0003', test.id('ABC_NV')));

-- Quản trị viên (không phải chủ sở hữu) không tự trao quyền quản trị cho người khác
SELECT set_config('hasura.user', json_build_object('x-hasura-user-id', test.id('qt'))::text, true);
SELECT test.throws($$INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
                     SELECT test.id('ABC'), id, test.id('ABC_NV'), 'TENANT' FROM core.role
                     WHERE tenant_id = test.id('ABC') AND code = 'QUAN_TRI_TO_CHUC'$$,
                   '%Chỉ chủ sở hữu%', 'quản trị viên không cấp vai trò quản trị');
SELECT test.throws($$INSERT INTO core.assignment (tenant_id, person_id, position_id, assignment_type, valid_period)
                     VALUES (test.id('ABC'), test.id('nv'), test.id('ABC_QT'), 'CONCURRENT', tstzrange(now(), NULL))$$,
                   '%Chỉ chủ sở hữu%', 'không bổ nhiệm người khác vào vị trí quản trị');
SELECT test.throws($$INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
                     SELECT test.id('ABC'), id, 'core.permission.manage' FROM core.role
                     WHERE tenant_id = test.id('ABC') AND code = 'QUAN_LY'$$,
                   '%Chỉ chủ sở hữu%', 'không thêm quyền quản trị vào vai trò khác');
SELECT test.throws($$INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period)
                     VALUES (test.id('ABC'), test.id('qt'), test.id('nv'), test.id('ABC_QT'),
                             tstzrange(now(), now() + interval '3 days'))$$,
                   '%Chỉ chủ sở hữu%', 'không ủy quyền toàn bộ quyền quản trị');
SELECT test.throws($$DELETE FROM core.role_grant WHERE position_id = test.id('ABC_GD')$$,
                   '%Chỉ chủ sở hữu%', 'không thu hồi quyền quản trị của chủ sở hữu');
-- Việc thường vẫn làm được
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('ABC'), id, test.id('ABC_NV'), 'UNIT' FROM core.role WHERE tenant_id = test.id('ABC') AND code = 'QUAN_LY';

-- Chủ sở hữu trao được
SELECT set_config('hasura.user', json_build_object('x-hasura-user-id', test.id('chu'))::text, true);
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT test.id('ABC'), id, test.id('ABC_NV'), 'TENANT' FROM core.role WHERE tenant_id = test.id('ABC') AND code = 'QUAN_TRI_TO_CHUC';
SELECT test.ok(core.has_permission(test.id('nv'), 'core.org.manage', test.id('ABC_ROOT')), 'chủ sở hữu trao quyền quản trị');

-- Công ty chưa có chủ sở hữu (dữ liệu có từ trước) giữ cách cũ
SELECT set_config('hasura.user', json_build_object('x-hasura-user-id', test.id('c'))::text, true);
INSERT INTO core.role (tenant_id, id, code, name) VALUES (test.id('TDX'), test.put('QT_CU', gen_random_uuid()), 'QT_CU', 'Quản trị cũ');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES (test.id('TDX'), test.id('QT_CU'), 'core.permission.manage');
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
VALUES (test.id('TDX'), test.id('QT_CU'), test.id('P_NV_MH_DT'), 'TENANT');
SELECT set_config('hasura.user', '', true);

-- Mỗi mã số thuế một công ty
UPDATE core.tenant SET tax_code = '0101234567', legal_status = 'UNVERIFIED' WHERE id = test.id('ABC');
SELECT test.throws($$UPDATE core.tenant SET tax_code = '0101234567' WHERE id = test.id('TDX')$$, '%tax_code%',
                   'mã số thuế không trùng');
SELECT test.throws($$UPDATE core.tenant SET tax_code = '12345' WHERE id = test.id('TDX')$$, '%tax_code_check%',
                   'mã số thuế 10 hoặc 13 số');
