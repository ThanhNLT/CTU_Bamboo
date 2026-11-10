-- Bamboo - DX-OS Open-Core
-- @version 0.4.0
-- @author CTUBamboo
-- @copyright Copyright 2026 Bamboo
-- @license Apache-2.0
-- @see https://github.com/CTUBamboo/Bamboo, Bamboo project

SELECT test.fixture();

INSERT INTO core.role (tenant_id, code, name) VALUES
    (test.id('TDX'), 'MUA_HANG', 'Mua hàng'),
    (test.id('TDX'), 'QUAN_LY', 'Quản lý'),
    (test.id('TDX'), 'KIEM_TOAN', 'Kiểm toán');
INSERT INTO test.ids SELECT 'R_' || code, id FROM core.role WHERE tenant_id = test.id('TDX');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code) VALUES
    (test.id('TDX'), test.id('R_MUA_HANG'), 'proc.purchase_request.create'),
    (test.id('TDX'), test.id('R_MUA_HANG'), 'proc.purchase_request.read'),
    (test.id('TDX'), test.id('R_QUAN_LY'), 'proc.purchase_request.read'),
    (test.id('TDX'), test.id('R_QUAN_LY'), 'wf.approval.act'),
    (test.id('TDX'), test.id('R_KIEM_TOAN'), 'proc.purchase_request.read');

INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
VALUES (test.id('TDX'), test.id('R_MUA_HANG'), test.id('P_NV_MH_DT'), 'UNIT');
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
VALUES (test.id('TDX'), test.id('R_QUAN_LY'), test.id('P_GD_DT'), 'SUBTREE');

SELECT test.ok(core.has_permission(test.id('c'), 'proc.purchase_request.create', test.id('DT_MH')),
               'Chị C lập được đề nghị ở Phòng Mua hàng');
SELECT test.ok(NOT core.has_permission(test.id('c'), 'proc.purchase_request.create', test.id('DT')),
               'Phạm vi UNIT không lan lên đơn vị cha');
SELECT test.ok(NOT core.has_permission(test.id('d'), 'proc.purchase_request.create', test.id('DT_MH')),
               'Anh D ở ghế khác không có quyền của ghế chị C');
SELECT test.ok(core.has_permission(test.id('gd_dt'), 'proc.purchase_request.read', test.id('DT_MH')),
               'Giám đốc Điện thoại X xem được cả cây con');
SELECT test.ok(NOT core.has_permission(test.id('gd_dt'), 'proc.purchase_request.read', test.id('CHIP_KD')),
               'Giám đốc Điện thoại X không xem được Chip X');

SELECT test.end_assignment('c', 'P_NV_MH_DT');
SELECT test.end_assignment('d', 'P_NV2_MH_DT');
SELECT set_config('bms.transfer_applying', 'on', false);
SELECT test.assign('TDX', 'c', 'P_NV2_MH_DT', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.assign('TDX', 'd', 'P_NV_MH_DT', 'PRIMARY', tstzrange(now(), NULL));
SELECT test.ok(NOT core.has_permission(test.id('c'), 'proc.purchase_request.create', test.id('DT_MH')),
               'Chị C rời ghế thì mất quyền của ghế');
SELECT test.ok(core.has_permission(test.id('d'), 'proc.purchase_request.create', test.id('DT_MH')),
               'Anh D ngồi ghế thì nhận quyền của ghế');

INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, permission_codes, valid_period)
VALUES (test.id('TDX'), test.id('gd_dt'), test.id('tp_mh_dt'), test.id('P_GD_DT'),
        ARRAY['proc.purchase_request.read'], tstzrange(now() - interval '1 day', now() + interval '7 days'));
SELECT test.ok(core.has_permission(test.id('tp_mh_dt'), 'proc.purchase_request.read', test.id('DT')),
               'Người nhận ủy quyền có quyền được giao');
SELECT test.ok(NOT core.has_permission(test.id('tp_mh_dt'), 'wf.approval.act', test.id('DT')),
               'Người nhận ủy quyền không có quyền ngoài danh sách');
SELECT test.ok(NOT core.has_permission(test.id('tp_mh_dt'), 'proc.purchase_request.read', test.id('DT'), now() + interval '8 days'),
               'Hết hạn ủy quyền thì hết quyền');
SELECT test.ok(core.has_permission(test.id('gd_dt'), 'proc.purchase_request.read', test.id('DT')),
               'Người ủy quyền vẫn giữ quyền của mình');
SELECT test.throws(format($$INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period)
                            VALUES (%L, %L, %L, %L, tstzrange(now(), now() + interval '1 day'))$$,
                          test.id('TDX'), test.id('c'), test.id('d'), test.id('P_GD_DT')),
                   '%phải giữ vị trí%', 'Không ủy quyền vị trí mình không giữ');
SELECT test.throws(format($$INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period)
                            VALUES (%L, %L, %L, %L, tstzrange(now(), now() + interval '1 day'))$$,
                          test.id('TDX'), test.id('gd_dt'), test.id('gd_chip'), test.id('P_GD_DT')),
                   '%cùng công ty%', 'Không ủy quyền cho người công ty khác');

SELECT test.throws(format($$INSERT INTO core.role_grant (tenant_id, role_id, person_id, scope)
                            VALUES (%L, %L, %L, 'TENANT')$$, test.id('TDX'), test.id('R_KIEM_TOAN'), test.id('e')),
                   '%role_grant_person_has_end%', 'Gán cho người phải có thời hạn');
SELECT test.throws(format($$INSERT INTO core.role_grant (tenant_id, role_id, person_id, scope, valid_period)
                            VALUES (%L, %L, %L, 'TENANT', tstzrange(now(), now() + interval '30 days'))$$,
                          test.id('TDX'), test.id('R_KIEM_TOAN'), test.id('a')),
                   '%bổ nhiệm trong cây tổ chức%', 'Người trong cây tổ chức không được gán thẳng');
INSERT INTO core.role_grant (tenant_id, role_id, person_id, scope, valid_period)
VALUES (test.id('TDX'), test.id('R_KIEM_TOAN'), test.id('e'), 'TENANT', tstzrange(now(), now() + interval '30 days'));
SELECT test.ok(core.has_permission(test.id('e'), 'proc.purchase_request.read', test.id('CHIP_KD')),
               'Kiểm toán viên bên ngoài xem được toàn tenant trong thời hạn');
