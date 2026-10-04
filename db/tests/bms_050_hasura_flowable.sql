-- SPDX-FileCopyrightText: 2026 DX-OS Open-Core contributors
--
-- SPDX-License-Identifier: Apache-2.0

-- Quyền xem chứng từ (computed field can_read của Hasura) và cờ đồng bộ Flowable (ADR #31).
SELECT test.fixture();

SELECT test.pr('pr', 'c', 'P_NV_MH_DT', 20000000);
SELECT test.ok(wf.entity_can_read('proc.purchase_request', test.id('pr'), test.id('c')), 'Người lập xem được');
SELECT test.ok(wf.entity_can_read('proc.purchase_request', test.id('pr'), test.id('tp_mh_dt')), 'Người nhận việc xem được');
SELECT test.ok(NOT wf.entity_can_read('proc.purchase_request', test.id('pr'), test.id('d')), 'Đồng nghiệp không có quyền thì không xem được');
SELECT test.ok(NOT wf.entity_can_read('proc.purchase_request', test.id('pr'), NULL), 'Không có phiên thì không xem được');
SELECT test.ok((SELECT proc.purchase_request_can_read(r, json_build_object('x-hasura-user-id', test.id('c')))
                FROM proc.purchase_request r WHERE id = test.id('pr')), 'Computed field đọc người gọi từ phiên Hasura');

-- Ủy quyền: người được ủy quyền xem được chứng từ đang chờ người ủy quyền duyệt.
INSERT INTO core.delegation (tenant_id, delegator_id, delegate_id, position_id, valid_period)
VALUES (test.id('TDX'), test.id('tp_mh_dt'), test.id('d'), test.id('P_TP_MH_DT'),
        tstzrange(now() - interval '1 day', now() + interval '1 day'));
SELECT test.ok(wf.entity_can_read('proc.purchase_request', test.id('pr'), test.id('d')), 'Người được ủy quyền xem được');

-- Quyền xem theo đơn vị.
INSERT INTO core.role (tenant_id, code, name) VALUES (test.id('TDX'), 'XEM', 'Xem');
INSERT INTO core.role_permission (tenant_id, role_id, permission_code)
SELECT tenant_id, id, 'proc.purchase_request.read' FROM core.role WHERE code = 'XEM';
INSERT INTO core.role_grant (tenant_id, role_id, position_id, scope)
SELECT tenant_id, id, test.id('P_GD_DT'), 'SUBTREE' FROM core.role WHERE code = 'XEM';
SELECT test.ok(wf.entity_can_read('proc.purchase_request', test.id('pr'), test.id('gd_dt')), 'Có quyền xem trên cây đơn vị');

-- Lập nháp từ phiên Hasura: người lập phải là người gọi và có quyền lập.
SELECT set_config('hasura.user', json_build_object('x-hasura-role', 'user', 'x-hasura-user-id', test.id('c'))::text, true);
SELECT test.throws($$SELECT test.pr('pr_h', 'c', 'P_NV_MH_DT', 1, false)$$, '%Không có quyền lập%',
                   'Không có quyền lập thì không lập được qua Hasura');
SELECT test.throws($$SELECT test.pr('pr_h2', 'd', 'P_NV2_MH_DT', 1, false)$$, '%người đang đăng nhập%',
                   'Không lập thay người khác');
SELECT set_config('hasura.user', '', true);

-- Cờ đồng bộ: mỗi lần gửi duyệt một dòng, được đánh dấu lại khi có thay đổi.
SELECT test.eq((SELECT count(*) FROM wf.flow_sync WHERE entity_id = test.id('pr') AND dirty), 1::bigint,
               'Gửi duyệt thì đánh dấu cần đồng bộ');
UPDATE wf.flow_sync SET dirty = false WHERE entity_id = test.id('pr');
SELECT test.approve('pr', 'tp_mh_dt');
SELECT test.ok((SELECT dirty FROM wf.flow_sync WHERE entity_id = test.id('pr')), 'Duyệt thì đánh dấu lại');
